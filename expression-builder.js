(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (angular, undefined) {

   var module = angular.module('expression-builder', []);

   require('./builder/expression-builder')(angular);
   require('./model/eb-expression')(angular);
   require('./model/eb-node')(angular);
   require('./model/eb-class')(angular);

   var SerializationService = require('./services/serialization'),
       DeserializationService = require('./services/deserialization');

   module.factory('expressionBuilderSerializer', [function () {
      return {
         serialize: function (node) {
            return new SerializationService(node).serialize();
         },
         deserialize: function (schema, data) {
            return new DeserializationService(schema).deserialize(data);
         }
      }
   }]);

})(angular);
},{"./builder/expression-builder":2,"./model/eb-class":7,"./model/eb-expression":8,"./model/eb-node":9,"./services/deserialization":11,"./services/serialization":13}],2:[function(require,module,exports){
var nodeSchemaFactoryT = require('./node-schema'),
	 groupSchemaFactoryT = require('./group-schema'),
	 patch = require('../services/patch'),
	 utility = require('../services/utils'),
	 ExpressionGroup = require('../model/expression-group');

module.exports = function (angular) {
	angular.module('expression-builder').factory('ExpressionBuilder', Factory);
	Factory.$inject = [];

	function Factory() {
		function ExpressionBuilder(expressions, globalSettings) {
			var GroupSchema = groupSchemaFactoryT();
			var NodeSchema = nodeSchemaFactoryT(GroupSchema);

			expressions.forEach(function (settings) {
				var factory = function (id, parameters) {

					var build = function (node, line) {
						var expression = utility.defaults(parameters, settings.defaults, globalSettings.defaults);
						expression.id = id;
						expression.type = settings.type;

						var group = new ExpressionGroup();
						group.id = id;
						group.expressions.push(expression);
						expression.template = settings.templateUrl;
						line.add(group);

						patch.methodsOf(expression).with(node, line);

						var keys = Object.keys(expression);

						keys.forEach(function (key) {
							var sourceFunction = expression[key];

							if (utility.isFunction(sourceFunction)) {
								expression[key] = function () {
									var result = sourceFunction();

									// TODO add decorator for muttable methods instead of trigger
									if (!line.immutable) {
										expression.method = expression.method || [];
										if (expression.method.indexOf(key) < 0) {
											expression.method.push(key);
										}

										line.immutable = true;
									}
									return result;
								};
							}
						});

						return node;
					};

					this.plan.push(build);
					this.planMap[id] = build;

					return this;
				};

				var groupFactory = function (id, parameters) {

					var build = function (node, line, expressionGroup) {
						var expression = utility.defaults(parameters, settings.defaults, globalSettings.defaults);
						expression.id = id;
						expression.type = settings.type;
						expression.template = settings.templateUrl;
						expressionGroup.expressions.push(expression);

						patch.methodsOf(expression).with(node, line);

						return node;
					};

					this.plan.push(build);

					return this;
				};

				NodeSchema.prototype[settings.type] = factory;
				GroupSchema.prototype[settings.type] = groupFactory;
			});

			return new NodeSchema();
		}

		return ExpressionBuilder;
	}
};
},{"../model/expression-group":10,"../services/patch":12,"../services/utils":14,"./group-schema":3,"./node-schema":5}],3:[function(require,module,exports){
module.exports = function () {
   function GroupSchema(node, line) {
      this.plan = [];
      this.line = line;
      this.node = node;
   }

   GroupSchema.prototype.apply = function (expressionGroup) {
      var self = this;
      this.plan.forEach(function (p) {
         p(self.node, self.line, expressionGroup);
      });
   };

   return GroupSchema;
};

},{}],4:[function(require,module,exports){
module.exports = Line;

var ExpressionGroup = require('../model/expression-group'),
	 utility = require('../services/utils');

function Line(GroupSchema) {
	this.expressions = [];

	// TODO add decorator for muttable methods instead of trigger
	this.immutable = true;

	var getIndex = (function (id) {
		var index = utility.indexOf(this.expressions, function (item) {
			return item.id === id;
		});

		if (index < 0) {
			throw Error('Expression ' + id + ' not found');
		}

		return index;
	}).bind(this);

	this.add = function (expression) {
		this.expressions.push(expression);
	};

	this.clone = function (id) {
		return angular.copy(this.get(id));
	};

	this.get = function (id) {
		return this.expressions[getIndex(id)];
	};

	this.put = function (id, node, build) {
		var index = getIndex(id),
			 schema = new GroupSchema(node, this),
			 group = new ExpressionGroup();

		build(schema);
		schema.apply(group);
		group.id = id;
		this.expressions.splice(index, 1, group)
		this.immutable = false;
	};

	this.remove = function (id) {
		var index = getIndex(id);
		this.expressions[index].expressions = [];
	};
}
},{"../model/expression-group":10,"../services/utils":14}],5:[function(require,module,exports){
var Node = require('./node'),
    Line = require('./line'),
    ExpressionGroup = require('../model/expression-group');

module.exports = function (GroupSchema, undefined) {
    function NodeSchema(map) {
        this.plan = [];
        this.planMap = {};
        this.schemaMap = map || {};
        this.GroupSchema = GroupSchema;
    }

    NodeSchema.prototype.clone = function () {
        var schema = new NodeSchema(this.map);
        schema.plan = this.plan;
        schema.planMap = this.planMap;
        return schema;

    };

    NodeSchema.prototype.attr = function (key, value) {
        var addAttribute = function (node, line) {
            node.attr(key, value);
        };

        this.plan.push(addAttribute);

        return this;
    };

    NodeSchema.prototype.apply = function (node) {
        node = node || new Node('#root', this);

        var line = new Line(GroupSchema);
        node.line = line;

        this.plan.forEach(function (p) {
            p(node, line);
        });

        return node;
    };

    NodeSchema.prototype.node = function (id, build) {
        var self = this;

        if (!build) {
            throw new Error('Build function is not defined');
        }

        var buildNode = function (node, line) {
            var schema = new NodeSchema(self.schemaMap);
            build(schema);

            var newNode = new Node(id, schema, node);
            schema.apply(newNode);
            node.addChildAfter(newNode);
            self.schemaMap[id] = schema;

            return node;
        };

        this.plan.push(buildNode);

        return this;
    };

    NodeSchema.prototype.group = function (id, build) {
        if (!build) {
            throw new Error('Build function is not defined');
        }

        var buildGroup = function (node, line) {
            var expressionGroup = new ExpressionGroup();
            expressionGroup.id = id;

            var schema = new GroupSchema(node, line);
            build(schema);
            schema.apply(expressionGroup);
            line.add(expressionGroup);

            return node;
        };

        this.plan.push(buildGroup);
        this.planMap[id] = buildGroup;

        return this;
    };

    return NodeSchema;
};
},{"../model/expression-group":10,"./line":4,"./node":6}],6:[function(require,module,exports){
var utility = require('../services/utils');

module.exports = Node;

function Node(id, schema, parent) {
    this.id = id;
    this.attributes = {};
    this.schema = schema;
    this.parent = parent;
    this.children = [];
    this.level = parent ? parent.level + 1 : 0;
}

Node.prototype.attr = function (key, value) {
    if (value !== undefined) {
        this.attributes[key] = value;
    } else {
        return this.attributes[key];
    }
};

Node.prototype.classes = function () { 
};

Node.prototype.addChildAfter = function (child, after) {
    var index = after
        ? this.children.indexOf(after)
        : this.children.length - 1;

    this.children.splice(index + 1, 0, child);
    child.parent = this;
    child.level = this.level + 1;
};

Node.prototype.addChildBefore = function (child, before) {
    var index = before
        ? this.children.indexOf(before)
        : 0;

    this.children.splice(index, 0, child);
    child.parent = this;
    child.level = this.level + 1;
};

Node.prototype.addAfter = function (child) {
    if (!this.parent) {
        throw Error('Can\'t add after root');
    }
    this.parent.addChildAfter(child, this);
};

Node.prototype.addBefore = function (child) {
    if (!this.parent) {
        throw Error('Can\'t add before root');
    }
    this.parent.addChildBefore(child, this);
};

Node.prototype.clone = function () {
    var node = new Node(this.id, this.schema);
    return this.schema.apply(node);
};

Node.prototype.remove = function () {
    if (!this.parent) {
        throw Error('Root element can\'t be removed');
    }

    var index = this.parent.children.indexOf(this);
    this.parent.children.splice(index, 1);
};

Node.prototype.clear = function () {
    this.children.forEach(function (child) {
        child.parent = null;
    });

    this.children = [];
};

Node.prototype.toString = function (ident) {
    ident = ident || 0;
    return Array(ident).join('-') + this.expression.id + ' ' + this.level + '\n' +
        this.children
            .map(function (child) {
                return child.toString(ident + 1);
            })
            .join('\n');
};

Node.prototype.toTraceString = function (ident) {
    if (null != this.parent) {
        var parent = this.parent;
        while (null !== parent.parent) {
            parent = parent.parent
        }

        return parent.toString();
    }

    return this.toString();
};
},{"../services/utils":14}],7:[function(require,module,exports){
var utils = require('../services/utils');

module.exports = function (angular) {
    angular.module('expression-builder').directive('ebClass', Directive);

    Directive.$inject = ['$parse'];

    function Directive($parse) {
        return {
            restrict: 'A',
            link: function (scope, element, attr) {
                var getter = $parse(attr.ebClass),
                    classes = [];
                
                var unbind = scope.$watch('node.attributes', function () {
                    var val = getter(scope),
                        classesToRemove = classes.join(' ');
                    classes = [];
                    
                    setClasses(val);
                    
                    element.removeClass(classesToRemove);
                    element.addClass(classes.join(' '));
                }, true);
                
                scope.$on('$destroy', function () {
                    unbind();
                });
                
                function setClasses (object) {
                    if(!object) {
                        return;
                    }
                    
                    var keys = Object.keys(object),
                        length = keys.length;
                    
                    for(var i = 0; i < length; i++) {
                        var key = keys[i];
                        setClass(key, object[key]);
                    }
                }
                
                function setClass(value, predicate) {
                    if (utils.isFunction(predicate)) {
                        if (predicate(scope.node)) {
                            classes.push(value);
                        }
                    } else {
                        if (predicate) {
                            classes.push(value);
                        }
                    }
                }
            }
        }
    }
};
},{"../services/utils":14}],8:[function(require,module,exports){
module.exports = function (angular) {

    angular.module('expression-builder').directive('ebExpression', Directive);

    Directive.$inject = ['$templateCache', '$compile'];

    function Directive($templateCache, $compile) {
        return {
            restrict: 'A',
            scope: {
                expression: '=ebExpression'
            },
            link: function (scope, element, attr) {
                var template = $templateCache.get(scope.expression.template);
                var expression = $compile(template)(scope);
                element.append(expression);
            }
        }
    }
};
},{}],9:[function(require,module,exports){
module.exports = function (angular) {
    angular.module('expression-builder').directive('ebNode', Directive);

    Directive.$inject = [];

    function Directive() {
        return {
            restrict: 'A',
            scope: {
                node: '=ebNode'
            },
            templateUrl: 'eb-node.html',
            link: function (scope, element, attr) {
            }
        }
    }
};
},{}],10:[function(require,module,exports){
module.exports = Group;

function Group() {
    this.expressions = [];
    this.template = 'eb-group.html';
}

},{}],11:[function(require,module,exports){
var utility = require('./utils'),
    Node = require('../builder/node');

module.exports = DeserializationService;

function traverse(node, map) {
    if (!map.hasOwnProperty(node.id)) {
        map[node.id] = node;
    }

    for (var i = 0, length = node.children.length; i < length; i++) {
        var child = node.children[0]
        traverse(child, map);
    }
}

function DeserializationService(schema) {
    function deserialize(data, parent, nodeMap) {
        nodeMap = nodeMap || {};

        if (!parent) {
            var node = new Node(data.id, schema);
            schema.apply(node);
            traverse(node, nodeMap);
            node.clear();
        } else {
            var node = nodeMap[data.id];
            node = node.clone();
            parent.addChildAfter(node);
            traverse(parent, nodeMap);
            node.clear();
        }

        node.attributes = data.attributes;
        deserializeLine(node, node.line, data.line);

        var children = data.children,
            length = children.length;

        for (var i = 0; i < length; i++) {
            var child = children[i];
            new DeserializationService(schema.schemaMap[child.id]).deserialize(child, node, nodeMap);

        }

        return node;
    }

    function deserializeLine(node, line, dataLine) {
        for (var i = 0, length = dataLine.length; i < length; i++) {
            var serializedGroup = dataLine[i];

            deserializeGroup(node, line, line.get(serializedGroup.id), serializedGroup);
        }
    }

    function deserializeGroup(node, line, group, dataGroup) {
        var serializedExpressions = dataGroup.expressions,
            length = serializedExpressions.length;

        for (var i = 0; i < length; i++) {
            var serializedExp = serializedExpressions[i];

            var index = utility.indexOf(group.expressions, function (expression) {
                return expression.id === serializedExp.id;
            });

            utility.override(group.expressions[index], serializedExp);
        }

        for (var i = 0; i < length; i++) {
            if (serializedExpressions[i].method) {
                serializedExpressions[i].method.forEach(function (m) {
                    group.expressions[index][m](node, line);
                    group.expressions[index].method = serializedExpressions[i].method;
                });
            }
        }
    }

    this.deserialize = deserialize;
}

},{"../builder/node":6,"./utils":14}],12:[function(require,module,exports){
var utility = require('./utils');

module.exports = {
    method: method,
    methodsOf: methodsOf
};

function method(object, key) {
    var sourceFunction = object[key];

    return {
        with: withFactory(object, key, sourceFunction)
    }
}

function methodsOf(obj) {
    var keys = Object.keys(obj),
        length = keys.length,
        patch = {};

    for (var i = 0; i < length; i++) {
        var key = keys[i];

        if (utility.isFunction(obj[key])) {
            patch[key] = method(obj, key);
        }
    }

    return {
        with: function () {
            var keys = Object.keys(patch),
                length = keys.length,
                args = utility.asArray(arguments);

            for (var i = 0; i < length; i++) {
                var key = keys[i];
                obj.action = key;
                patch[key].with.apply(obj, args);
            }
        }
    }
}

function withFactory(object, key, sourceFunction) {
    var withFunction = function () {
        var args = utility.asArray(arguments);

        object[key] = function () {
            return sourceFunction.apply(object, args);
        };
    };

    withFunction.decorator = function (decorate) {
        var args = utility.asArray(arguments).slice(1);

        object[key] = function () {
            return decorate.apply(object, [sourceFunction, object, key].concat(args));
        };
    };

    return withFunction;
}

},{"./utils":14}],13:[function(require,module,exports){
var utility = require('./utils');

module.exports = SerializationService;

function SerializationService(node) {
    function serialize() {
        var groups = node.line.expressions.map(serializeGroup);
        var attrs = utility.clone(node.attributes);
        delete attrs.serialize;

        return {
            id: node.id,
            attributes: attrs,
            children: node.children.map(function (child) {
                return new SerializationService(child).serialize();
            }),
            line: groups.filter(function (group) {
                return group.expressions.length;
            })
        }
    }

    function serializeGroup(group) {
        return {
            id: group.id,
            expressions: group.expressions
                .filter(serializable)
                .map(serializeExpression)
        }
    }

    function serializable(expression) {
        var serializeAttr = node.attr('serialize');
        if (!serializeAttr) {
            return false;
        }

        var propertiesToSerialize = serializeAttr[expression.id];

        return propertiesToSerialize && propertiesToSerialize.length;
    }

    function serializeExpression(expression) {
        var serializeAttr = node.attr('serialize');

        var result = {},
            propertiesToSerialize = serializeAttr[expression.id];

        for (var i = 0, length = propertiesToSerialize.length; i < length; i++) {
            var prop = propertiesToSerialize[i];
            result[prop] = expression[prop];
        }
        result.id = expression.id;
        result.type = expression.type;
        result.method = expression.method;

        return result;
    }

    this.serialize = serialize;
}

},{"./utils":14}],14:[function(require,module,exports){
module.exports = {
    asArray: asArray,
    clone: clone,
    defaults: defaults,
    indexOf: indexOf,
    isArray: Array.isArray,
    isFunction: isFunction,
    isObject: isObject,
    override: override
};

function indexOf(array, predicate) {
    for (var i = 0, length = array.length; i < length; i++) {
        if (predicate(array[i], i)) {
            return i;
        }
    }
    return -1;
}

function asArray(args) {
    return Array.prototype.slice.call(args);
}

function clone(object) {
    var result = {},
        keys = Object.keys(object);
    for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];
        result[key] = object[key]
    }

    return result;
}

function defaults(dst) {
    var sourcesLength = arguments.length;
    var args = asArray(arguments);
    var result = clone(dst);

    for (var i = 1; i < sourcesLength; i++) {
        var source = args[i];

        if (!source) {
            continue;
        }

        var keys = Object.keys(source);

        for (var k = 0, keysLength = keys.length; k < keysLength; k++) {
            var key = keys[k];
            if (!result.hasOwnProperty(key)) {
                result[key] = source[key];
            }
        }
    }

    return result;
}

function isFunction(value) {
    return typeof value === 'function';
}

function isObject(value) {
    return value !== null && typeof value === 'object';
}

function override(dst, src) {
    var keys = Object.keys(src),
        length = keys.length;

    for(var i = 0; i < length; i++) {
        var key = keys[i];
        dst[key] = src[key];
    }

    return dst;
}

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYm9vdHN0cmFwLmpzIiwic3JjL2J1aWxkZXIvZXhwcmVzc2lvbi1idWlsZGVyLmpzIiwic3JjL2J1aWxkZXIvZ3JvdXAtc2NoZW1hLmpzIiwic3JjL2J1aWxkZXIvbGluZS5qcyIsInNyYy9idWlsZGVyL25vZGUtc2NoZW1hLmpzIiwic3JjL2J1aWxkZXIvbm9kZS5qcyIsInNyYy9tb2RlbC9lYi1jbGFzcy5qcyIsInNyYy9tb2RlbC9lYi1leHByZXNzaW9uLmpzIiwic3JjL21vZGVsL2ViLW5vZGUuanMiLCJzcmMvbW9kZWwvZXhwcmVzc2lvbi1ncm91cC5qcyIsInNyYy9zZXJ2aWNlcy9kZXNlcmlhbGl6YXRpb24uanMiLCJzcmMvc2VydmljZXMvcGF0Y2guanMiLCJzcmMvc2VydmljZXMvc2VyaWFsaXphdGlvbi5qcyIsInNyYy9zZXJ2aWNlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKGFuZ3VsYXIsIHVuZGVmaW5lZCkge1xyXG5cclxuICAgdmFyIG1vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKCdleHByZXNzaW9uLWJ1aWxkZXInLCBbXSk7XHJcblxyXG4gICByZXF1aXJlKCcuL2J1aWxkZXIvZXhwcmVzc2lvbi1idWlsZGVyJykoYW5ndWxhcik7XHJcbiAgIHJlcXVpcmUoJy4vbW9kZWwvZWItZXhwcmVzc2lvbicpKGFuZ3VsYXIpO1xyXG4gICByZXF1aXJlKCcuL21vZGVsL2ViLW5vZGUnKShhbmd1bGFyKTtcclxuICAgcmVxdWlyZSgnLi9tb2RlbC9lYi1jbGFzcycpKGFuZ3VsYXIpO1xyXG5cclxuICAgdmFyIFNlcmlhbGl6YXRpb25TZXJ2aWNlID0gcmVxdWlyZSgnLi9zZXJ2aWNlcy9zZXJpYWxpemF0aW9uJyksXHJcbiAgICAgICBEZXNlcmlhbGl6YXRpb25TZXJ2aWNlID0gcmVxdWlyZSgnLi9zZXJ2aWNlcy9kZXNlcmlhbGl6YXRpb24nKTtcclxuXHJcbiAgIG1vZHVsZS5mYWN0b3J5KCdleHByZXNzaW9uQnVpbGRlclNlcmlhbGl6ZXInLCBbZnVuY3Rpb24gKCkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgICBzZXJpYWxpemU6IGZ1bmN0aW9uIChub2RlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgU2VyaWFsaXphdGlvblNlcnZpY2Uobm9kZSkuc2VyaWFsaXplKCk7XHJcbiAgICAgICAgIH0sXHJcbiAgICAgICAgIGRlc2VyaWFsaXplOiBmdW5jdGlvbiAoc2NoZW1hLCBkYXRhKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGVzZXJpYWxpemF0aW9uU2VydmljZShzY2hlbWEpLmRlc2VyaWFsaXplKGRhdGEpO1xyXG4gICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgfV0pO1xyXG5cclxufSkoYW5ndWxhcik7IiwidmFyIG5vZGVTY2hlbWFGYWN0b3J5VCA9IHJlcXVpcmUoJy4vbm9kZS1zY2hlbWEnKSxcclxuXHQgZ3JvdXBTY2hlbWFGYWN0b3J5VCA9IHJlcXVpcmUoJy4vZ3JvdXAtc2NoZW1hJyksXHJcblx0IHBhdGNoID0gcmVxdWlyZSgnLi4vc2VydmljZXMvcGF0Y2gnKSxcclxuXHQgdXRpbGl0eSA9IHJlcXVpcmUoJy4uL3NlcnZpY2VzL3V0aWxzJyksXHJcblx0IEV4cHJlc3Npb25Hcm91cCA9IHJlcXVpcmUoJy4uL21vZGVsL2V4cHJlc3Npb24tZ3JvdXAnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFuZ3VsYXIpIHtcclxuXHRhbmd1bGFyLm1vZHVsZSgnZXhwcmVzc2lvbi1idWlsZGVyJykuZmFjdG9yeSgnRXhwcmVzc2lvbkJ1aWxkZXInLCBGYWN0b3J5KTtcclxuXHRGYWN0b3J5LiRpbmplY3QgPSBbXTtcclxuXHJcblx0ZnVuY3Rpb24gRmFjdG9yeSgpIHtcclxuXHRcdGZ1bmN0aW9uIEV4cHJlc3Npb25CdWlsZGVyKGV4cHJlc3Npb25zLCBnbG9iYWxTZXR0aW5ncykge1xyXG5cdFx0XHR2YXIgR3JvdXBTY2hlbWEgPSBncm91cFNjaGVtYUZhY3RvcnlUKCk7XHJcblx0XHRcdHZhciBOb2RlU2NoZW1hID0gbm9kZVNjaGVtYUZhY3RvcnlUKEdyb3VwU2NoZW1hKTtcclxuXHJcblx0XHRcdGV4cHJlc3Npb25zLmZvckVhY2goZnVuY3Rpb24gKHNldHRpbmdzKSB7XHJcblx0XHRcdFx0dmFyIGZhY3RvcnkgPSBmdW5jdGlvbiAoaWQsIHBhcmFtZXRlcnMpIHtcclxuXHJcblx0XHRcdFx0XHR2YXIgYnVpbGQgPSBmdW5jdGlvbiAobm9kZSwgbGluZSkge1xyXG5cdFx0XHRcdFx0XHR2YXIgZXhwcmVzc2lvbiA9IHV0aWxpdHkuZGVmYXVsdHMocGFyYW1ldGVycywgc2V0dGluZ3MuZGVmYXVsdHMsIGdsb2JhbFNldHRpbmdzLmRlZmF1bHRzKTtcclxuXHRcdFx0XHRcdFx0ZXhwcmVzc2lvbi5pZCA9IGlkO1xyXG5cdFx0XHRcdFx0XHRleHByZXNzaW9uLnR5cGUgPSBzZXR0aW5ncy50eXBlO1xyXG5cclxuXHRcdFx0XHRcdFx0dmFyIGdyb3VwID0gbmV3IEV4cHJlc3Npb25Hcm91cCgpO1xyXG5cdFx0XHRcdFx0XHRncm91cC5pZCA9IGlkO1xyXG5cdFx0XHRcdFx0XHRncm91cC5leHByZXNzaW9ucy5wdXNoKGV4cHJlc3Npb24pO1xyXG5cdFx0XHRcdFx0XHRleHByZXNzaW9uLnRlbXBsYXRlID0gc2V0dGluZ3MudGVtcGxhdGVVcmw7XHJcblx0XHRcdFx0XHRcdGxpbmUuYWRkKGdyb3VwKTtcclxuXHJcblx0XHRcdFx0XHRcdHBhdGNoLm1ldGhvZHNPZihleHByZXNzaW9uKS53aXRoKG5vZGUsIGxpbmUpO1xyXG5cclxuXHRcdFx0XHRcdFx0dmFyIGtleXMgPSBPYmplY3Qua2V5cyhleHByZXNzaW9uKTtcclxuXHJcblx0XHRcdFx0XHRcdGtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcblx0XHRcdFx0XHRcdFx0dmFyIHNvdXJjZUZ1bmN0aW9uID0gZXhwcmVzc2lvbltrZXldO1xyXG5cclxuXHRcdFx0XHRcdFx0XHRpZiAodXRpbGl0eS5pc0Z1bmN0aW9uKHNvdXJjZUZ1bmN0aW9uKSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0ZXhwcmVzc2lvbltrZXldID0gZnVuY3Rpb24gKCkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHR2YXIgcmVzdWx0ID0gc291cmNlRnVuY3Rpb24oKTtcclxuXHJcblx0XHRcdFx0XHRcdFx0XHRcdC8vIFRPRE8gYWRkIGRlY29yYXRvciBmb3IgbXV0dGFibGUgbWV0aG9kcyBpbnN0ZWFkIG9mIHRyaWdnZXJcclxuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKCFsaW5lLmltbXV0YWJsZSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGV4cHJlc3Npb24ubWV0aG9kID0gZXhwcmVzc2lvbi5tZXRob2QgfHwgW107XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGV4cHJlc3Npb24ubWV0aG9kLmluZGV4T2Yoa2V5KSA8IDApIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGV4cHJlc3Npb24ubWV0aG9kLnB1c2goa2V5KTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGxpbmUuaW1tdXRhYmxlID0gdHJ1ZTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xyXG5cdFx0XHRcdFx0XHRcdFx0fTtcclxuXHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdH0pO1xyXG5cclxuXHRcdFx0XHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHRcdFx0XHR9O1xyXG5cclxuXHRcdFx0XHRcdHRoaXMucGxhbi5wdXNoKGJ1aWxkKTtcclxuXHRcdFx0XHRcdHRoaXMucGxhbk1hcFtpZF0gPSBidWlsZDtcclxuXHJcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcclxuXHRcdFx0XHR9O1xyXG5cclxuXHRcdFx0XHR2YXIgZ3JvdXBGYWN0b3J5ID0gZnVuY3Rpb24gKGlkLCBwYXJhbWV0ZXJzKSB7XHJcblxyXG5cdFx0XHRcdFx0dmFyIGJ1aWxkID0gZnVuY3Rpb24gKG5vZGUsIGxpbmUsIGV4cHJlc3Npb25Hcm91cCkge1xyXG5cdFx0XHRcdFx0XHR2YXIgZXhwcmVzc2lvbiA9IHV0aWxpdHkuZGVmYXVsdHMocGFyYW1ldGVycywgc2V0dGluZ3MuZGVmYXVsdHMsIGdsb2JhbFNldHRpbmdzLmRlZmF1bHRzKTtcclxuXHRcdFx0XHRcdFx0ZXhwcmVzc2lvbi5pZCA9IGlkO1xyXG5cdFx0XHRcdFx0XHRleHByZXNzaW9uLnR5cGUgPSBzZXR0aW5ncy50eXBlO1xyXG5cdFx0XHRcdFx0XHRleHByZXNzaW9uLnRlbXBsYXRlID0gc2V0dGluZ3MudGVtcGxhdGVVcmw7XHJcblx0XHRcdFx0XHRcdGV4cHJlc3Npb25Hcm91cC5leHByZXNzaW9ucy5wdXNoKGV4cHJlc3Npb24pO1xyXG5cclxuXHRcdFx0XHRcdFx0cGF0Y2gubWV0aG9kc09mKGV4cHJlc3Npb24pLndpdGgobm9kZSwgbGluZSk7XHJcblxyXG5cdFx0XHRcdFx0XHRyZXR1cm4gbm9kZTtcclxuXHRcdFx0XHRcdH07XHJcblxyXG5cdFx0XHRcdFx0dGhpcy5wbGFuLnB1c2goYnVpbGQpO1xyXG5cclxuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0XHRcdH07XHJcblxyXG5cdFx0XHRcdE5vZGVTY2hlbWEucHJvdG90eXBlW3NldHRpbmdzLnR5cGVdID0gZmFjdG9yeTtcclxuXHRcdFx0XHRHcm91cFNjaGVtYS5wcm90b3R5cGVbc2V0dGluZ3MudHlwZV0gPSBncm91cEZhY3Rvcnk7XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0cmV0dXJuIG5ldyBOb2RlU2NoZW1hKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIEV4cHJlc3Npb25CdWlsZGVyO1xyXG5cdH1cclxufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcclxuICAgZnVuY3Rpb24gR3JvdXBTY2hlbWEobm9kZSwgbGluZSkge1xyXG4gICAgICB0aGlzLnBsYW4gPSBbXTtcclxuICAgICAgdGhpcy5saW5lID0gbGluZTtcclxuICAgICAgdGhpcy5ub2RlID0gbm9kZTtcclxuICAgfVxyXG5cclxuICAgR3JvdXBTY2hlbWEucHJvdG90eXBlLmFwcGx5ID0gZnVuY3Rpb24gKGV4cHJlc3Npb25Hcm91cCkge1xyXG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICAgIHRoaXMucGxhbi5mb3JFYWNoKGZ1bmN0aW9uIChwKSB7XHJcbiAgICAgICAgIHAoc2VsZi5ub2RlLCBzZWxmLmxpbmUsIGV4cHJlc3Npb25Hcm91cCk7XHJcbiAgICAgIH0pO1xyXG4gICB9O1xyXG5cclxuICAgcmV0dXJuIEdyb3VwU2NoZW1hO1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IExpbmU7XHJcblxyXG52YXIgRXhwcmVzc2lvbkdyb3VwID0gcmVxdWlyZSgnLi4vbW9kZWwvZXhwcmVzc2lvbi1ncm91cCcpLFxyXG5cdCB1dGlsaXR5ID0gcmVxdWlyZSgnLi4vc2VydmljZXMvdXRpbHMnKTtcclxuXHJcbmZ1bmN0aW9uIExpbmUoR3JvdXBTY2hlbWEpIHtcclxuXHR0aGlzLmV4cHJlc3Npb25zID0gW107XHJcblxyXG5cdC8vIFRPRE8gYWRkIGRlY29yYXRvciBmb3IgbXV0dGFibGUgbWV0aG9kcyBpbnN0ZWFkIG9mIHRyaWdnZXJcclxuXHR0aGlzLmltbXV0YWJsZSA9IHRydWU7XHJcblxyXG5cdHZhciBnZXRJbmRleCA9IChmdW5jdGlvbiAoaWQpIHtcclxuXHRcdHZhciBpbmRleCA9IHV0aWxpdHkuaW5kZXhPZih0aGlzLmV4cHJlc3Npb25zLCBmdW5jdGlvbiAoaXRlbSkge1xyXG5cdFx0XHRyZXR1cm4gaXRlbS5pZCA9PT0gaWQ7XHJcblx0XHR9KTtcclxuXHJcblx0XHRpZiAoaW5kZXggPCAwKSB7XHJcblx0XHRcdHRocm93IEVycm9yKCdFeHByZXNzaW9uICcgKyBpZCArICcgbm90IGZvdW5kJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIGluZGV4O1xyXG5cdH0pLmJpbmQodGhpcyk7XHJcblxyXG5cdHRoaXMuYWRkID0gZnVuY3Rpb24gKGV4cHJlc3Npb24pIHtcclxuXHRcdHRoaXMuZXhwcmVzc2lvbnMucHVzaChleHByZXNzaW9uKTtcclxuXHR9O1xyXG5cclxuXHR0aGlzLmNsb25lID0gZnVuY3Rpb24gKGlkKSB7XHJcblx0XHRyZXR1cm4gYW5ndWxhci5jb3B5KHRoaXMuZ2V0KGlkKSk7XHJcblx0fTtcclxuXHJcblx0dGhpcy5nZXQgPSBmdW5jdGlvbiAoaWQpIHtcclxuXHRcdHJldHVybiB0aGlzLmV4cHJlc3Npb25zW2dldEluZGV4KGlkKV07XHJcblx0fTtcclxuXHJcblx0dGhpcy5wdXQgPSBmdW5jdGlvbiAoaWQsIG5vZGUsIGJ1aWxkKSB7XHJcblx0XHR2YXIgaW5kZXggPSBnZXRJbmRleChpZCksXHJcblx0XHRcdCBzY2hlbWEgPSBuZXcgR3JvdXBTY2hlbWEobm9kZSwgdGhpcyksXHJcblx0XHRcdCBncm91cCA9IG5ldyBFeHByZXNzaW9uR3JvdXAoKTtcclxuXHJcblx0XHRidWlsZChzY2hlbWEpO1xyXG5cdFx0c2NoZW1hLmFwcGx5KGdyb3VwKTtcclxuXHRcdGdyb3VwLmlkID0gaWQ7XHJcblx0XHR0aGlzLmV4cHJlc3Npb25zLnNwbGljZShpbmRleCwgMSwgZ3JvdXApXHJcblx0XHR0aGlzLmltbXV0YWJsZSA9IGZhbHNlO1xyXG5cdH07XHJcblxyXG5cdHRoaXMucmVtb3ZlID0gZnVuY3Rpb24gKGlkKSB7XHJcblx0XHR2YXIgaW5kZXggPSBnZXRJbmRleChpZCk7XHJcblx0XHR0aGlzLmV4cHJlc3Npb25zW2luZGV4XS5leHByZXNzaW9ucyA9IFtdO1xyXG5cdH07XHJcbn0iLCJ2YXIgTm9kZSA9IHJlcXVpcmUoJy4vbm9kZScpLFxyXG4gICAgTGluZSA9IHJlcXVpcmUoJy4vbGluZScpLFxyXG4gICAgRXhwcmVzc2lvbkdyb3VwID0gcmVxdWlyZSgnLi4vbW9kZWwvZXhwcmVzc2lvbi1ncm91cCcpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoR3JvdXBTY2hlbWEsIHVuZGVmaW5lZCkge1xyXG4gICAgZnVuY3Rpb24gTm9kZVNjaGVtYShtYXApIHtcclxuICAgICAgICB0aGlzLnBsYW4gPSBbXTtcclxuICAgICAgICB0aGlzLnBsYW5NYXAgPSB7fTtcclxuICAgICAgICB0aGlzLnNjaGVtYU1hcCA9IG1hcCB8fCB7fTtcclxuICAgICAgICB0aGlzLkdyb3VwU2NoZW1hID0gR3JvdXBTY2hlbWE7XHJcbiAgICB9XHJcblxyXG4gICAgTm9kZVNjaGVtYS5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgdmFyIHNjaGVtYSA9IG5ldyBOb2RlU2NoZW1hKHRoaXMubWFwKTtcclxuICAgICAgICBzY2hlbWEucGxhbiA9IHRoaXMucGxhbjtcclxuICAgICAgICBzY2hlbWEucGxhbk1hcCA9IHRoaXMucGxhbk1hcDtcclxuICAgICAgICByZXR1cm4gc2NoZW1hO1xyXG5cclxuICAgIH07XHJcblxyXG4gICAgTm9kZVNjaGVtYS5wcm90b3R5cGUuYXR0ciA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XHJcbiAgICAgICAgdmFyIGFkZEF0dHJpYnV0ZSA9IGZ1bmN0aW9uIChub2RlLCBsaW5lKSB7XHJcbiAgICAgICAgICAgIG5vZGUuYXR0cihrZXksIHZhbHVlKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnBsYW4ucHVzaChhZGRBdHRyaWJ1dGUpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH07XHJcblxyXG4gICAgTm9kZVNjaGVtYS5wcm90b3R5cGUuYXBwbHkgPSBmdW5jdGlvbiAobm9kZSkge1xyXG4gICAgICAgIG5vZGUgPSBub2RlIHx8IG5ldyBOb2RlKCcjcm9vdCcsIHRoaXMpO1xyXG5cclxuICAgICAgICB2YXIgbGluZSA9IG5ldyBMaW5lKEdyb3VwU2NoZW1hKTtcclxuICAgICAgICBub2RlLmxpbmUgPSBsaW5lO1xyXG5cclxuICAgICAgICB0aGlzLnBsYW4uZm9yRWFjaChmdW5jdGlvbiAocCkge1xyXG4gICAgICAgICAgICBwKG5vZGUsIGxpbmUpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gbm9kZTtcclxuICAgIH07XHJcblxyXG4gICAgTm9kZVNjaGVtYS5wcm90b3R5cGUubm9kZSA9IGZ1bmN0aW9uIChpZCwgYnVpbGQpIHtcclxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgICAgIGlmICghYnVpbGQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCdWlsZCBmdW5jdGlvbiBpcyBub3QgZGVmaW5lZCcpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGJ1aWxkTm9kZSA9IGZ1bmN0aW9uIChub2RlLCBsaW5lKSB7XHJcbiAgICAgICAgICAgIHZhciBzY2hlbWEgPSBuZXcgTm9kZVNjaGVtYShzZWxmLnNjaGVtYU1hcCk7XHJcbiAgICAgICAgICAgIGJ1aWxkKHNjaGVtYSk7XHJcblxyXG4gICAgICAgICAgICB2YXIgbmV3Tm9kZSA9IG5ldyBOb2RlKGlkLCBzY2hlbWEsIG5vZGUpO1xyXG4gICAgICAgICAgICBzY2hlbWEuYXBwbHkobmV3Tm9kZSk7XHJcbiAgICAgICAgICAgIG5vZGUuYWRkQ2hpbGRBZnRlcihuZXdOb2RlKTtcclxuICAgICAgICAgICAgc2VsZi5zY2hlbWFNYXBbaWRdID0gc2NoZW1hO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIG5vZGU7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5wbGFuLnB1c2goYnVpbGROb2RlKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9O1xyXG5cclxuICAgIE5vZGVTY2hlbWEucHJvdG90eXBlLmdyb3VwID0gZnVuY3Rpb24gKGlkLCBidWlsZCkge1xyXG4gICAgICAgIGlmICghYnVpbGQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCdWlsZCBmdW5jdGlvbiBpcyBub3QgZGVmaW5lZCcpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGJ1aWxkR3JvdXAgPSBmdW5jdGlvbiAobm9kZSwgbGluZSkge1xyXG4gICAgICAgICAgICB2YXIgZXhwcmVzc2lvbkdyb3VwID0gbmV3IEV4cHJlc3Npb25Hcm91cCgpO1xyXG4gICAgICAgICAgICBleHByZXNzaW9uR3JvdXAuaWQgPSBpZDtcclxuXHJcbiAgICAgICAgICAgIHZhciBzY2hlbWEgPSBuZXcgR3JvdXBTY2hlbWEobm9kZSwgbGluZSk7XHJcbiAgICAgICAgICAgIGJ1aWxkKHNjaGVtYSk7XHJcbiAgICAgICAgICAgIHNjaGVtYS5hcHBseShleHByZXNzaW9uR3JvdXApO1xyXG4gICAgICAgICAgICBsaW5lLmFkZChleHByZXNzaW9uR3JvdXApO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIG5vZGU7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5wbGFuLnB1c2goYnVpbGRHcm91cCk7XHJcbiAgICAgICAgdGhpcy5wbGFuTWFwW2lkXSA9IGJ1aWxkR3JvdXA7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gTm9kZVNjaGVtYTtcclxufTsiLCJ2YXIgdXRpbGl0eSA9IHJlcXVpcmUoJy4uL3NlcnZpY2VzL3V0aWxzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE5vZGU7XHJcblxyXG5mdW5jdGlvbiBOb2RlKGlkLCBzY2hlbWEsIHBhcmVudCkge1xyXG4gICAgdGhpcy5pZCA9IGlkO1xyXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0ge307XHJcbiAgICB0aGlzLnNjaGVtYSA9IHNjaGVtYTtcclxuICAgIHRoaXMucGFyZW50ID0gcGFyZW50O1xyXG4gICAgdGhpcy5jaGlsZHJlbiA9IFtdO1xyXG4gICAgdGhpcy5sZXZlbCA9IHBhcmVudCA/IHBhcmVudC5sZXZlbCArIDEgOiAwO1xyXG59XHJcblxyXG5Ob2RlLnByb3RvdHlwZS5hdHRyID0gZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcclxuICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdGhpcy5hdHRyaWJ1dGVzW2tleV0gPSB2YWx1ZTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cmlidXRlc1trZXldO1xyXG4gICAgfVxyXG59O1xyXG5cclxuTm9kZS5wcm90b3R5cGUuY2xhc3NlcyA9IGZ1bmN0aW9uICgpIHsgXHJcbn07XHJcblxyXG5Ob2RlLnByb3RvdHlwZS5hZGRDaGlsZEFmdGVyID0gZnVuY3Rpb24gKGNoaWxkLCBhZnRlcikge1xyXG4gICAgdmFyIGluZGV4ID0gYWZ0ZXJcclxuICAgICAgICA/IHRoaXMuY2hpbGRyZW4uaW5kZXhPZihhZnRlcilcclxuICAgICAgICA6IHRoaXMuY2hpbGRyZW4ubGVuZ3RoIC0gMTtcclxuXHJcbiAgICB0aGlzLmNoaWxkcmVuLnNwbGljZShpbmRleCArIDEsIDAsIGNoaWxkKTtcclxuICAgIGNoaWxkLnBhcmVudCA9IHRoaXM7XHJcbiAgICBjaGlsZC5sZXZlbCA9IHRoaXMubGV2ZWwgKyAxO1xyXG59O1xyXG5cclxuTm9kZS5wcm90b3R5cGUuYWRkQ2hpbGRCZWZvcmUgPSBmdW5jdGlvbiAoY2hpbGQsIGJlZm9yZSkge1xyXG4gICAgdmFyIGluZGV4ID0gYmVmb3JlXHJcbiAgICAgICAgPyB0aGlzLmNoaWxkcmVuLmluZGV4T2YoYmVmb3JlKVxyXG4gICAgICAgIDogMDtcclxuXHJcbiAgICB0aGlzLmNoaWxkcmVuLnNwbGljZShpbmRleCwgMCwgY2hpbGQpO1xyXG4gICAgY2hpbGQucGFyZW50ID0gdGhpcztcclxuICAgIGNoaWxkLmxldmVsID0gdGhpcy5sZXZlbCArIDE7XHJcbn07XHJcblxyXG5Ob2RlLnByb3RvdHlwZS5hZGRBZnRlciA9IGZ1bmN0aW9uIChjaGlsZCkge1xyXG4gICAgaWYgKCF0aGlzLnBhcmVudCkge1xyXG4gICAgICAgIHRocm93IEVycm9yKCdDYW5cXCd0IGFkZCBhZnRlciByb290Jyk7XHJcbiAgICB9XHJcbiAgICB0aGlzLnBhcmVudC5hZGRDaGlsZEFmdGVyKGNoaWxkLCB0aGlzKTtcclxufTtcclxuXHJcbk5vZGUucHJvdG90eXBlLmFkZEJlZm9yZSA9IGZ1bmN0aW9uIChjaGlsZCkge1xyXG4gICAgaWYgKCF0aGlzLnBhcmVudCkge1xyXG4gICAgICAgIHRocm93IEVycm9yKCdDYW5cXCd0IGFkZCBiZWZvcmUgcm9vdCcpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5wYXJlbnQuYWRkQ2hpbGRCZWZvcmUoY2hpbGQsIHRoaXMpO1xyXG59O1xyXG5cclxuTm9kZS5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICB2YXIgbm9kZSA9IG5ldyBOb2RlKHRoaXMuaWQsIHRoaXMuc2NoZW1hKTtcclxuICAgIHJldHVybiB0aGlzLnNjaGVtYS5hcHBseShub2RlKTtcclxufTtcclxuXHJcbk5vZGUucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgIGlmICghdGhpcy5wYXJlbnQpIHtcclxuICAgICAgICB0aHJvdyBFcnJvcignUm9vdCBlbGVtZW50IGNhblxcJ3QgYmUgcmVtb3ZlZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBpbmRleCA9IHRoaXMucGFyZW50LmNoaWxkcmVuLmluZGV4T2YodGhpcyk7XHJcbiAgICB0aGlzLnBhcmVudC5jaGlsZHJlbi5zcGxpY2UoaW5kZXgsIDEpO1xyXG59O1xyXG5cclxuTm9kZS5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICB0aGlzLmNoaWxkcmVuLmZvckVhY2goZnVuY3Rpb24gKGNoaWxkKSB7XHJcbiAgICAgICAgY2hpbGQucGFyZW50ID0gbnVsbDtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuY2hpbGRyZW4gPSBbXTtcclxufTtcclxuXHJcbk5vZGUucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGlkZW50KSB7XHJcbiAgICBpZGVudCA9IGlkZW50IHx8IDA7XHJcbiAgICByZXR1cm4gQXJyYXkoaWRlbnQpLmpvaW4oJy0nKSArIHRoaXMuZXhwcmVzc2lvbi5pZCArICcgJyArIHRoaXMubGV2ZWwgKyAnXFxuJyArXHJcbiAgICAgICAgdGhpcy5jaGlsZHJlblxyXG4gICAgICAgICAgICAubWFwKGZ1bmN0aW9uIChjaGlsZCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNoaWxkLnRvU3RyaW5nKGlkZW50ICsgMSk7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5qb2luKCdcXG4nKTtcclxufTtcclxuXHJcbk5vZGUucHJvdG90eXBlLnRvVHJhY2VTdHJpbmcgPSBmdW5jdGlvbiAoaWRlbnQpIHtcclxuICAgIGlmIChudWxsICE9IHRoaXMucGFyZW50KSB7XHJcbiAgICAgICAgdmFyIHBhcmVudCA9IHRoaXMucGFyZW50O1xyXG4gICAgICAgIHdoaWxlIChudWxsICE9PSBwYXJlbnQucGFyZW50KSB7XHJcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJlbnQudG9TdHJpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcy50b1N0cmluZygpO1xyXG59OyIsInZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3NlcnZpY2VzL3V0aWxzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhbmd1bGFyKSB7XHJcbiAgICBhbmd1bGFyLm1vZHVsZSgnZXhwcmVzc2lvbi1idWlsZGVyJykuZGlyZWN0aXZlKCdlYkNsYXNzJywgRGlyZWN0aXZlKTtcclxuXHJcbiAgICBEaXJlY3RpdmUuJGluamVjdCA9IFsnJHBhcnNlJ107XHJcblxyXG4gICAgZnVuY3Rpb24gRGlyZWN0aXZlKCRwYXJzZSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHJlc3RyaWN0OiAnQScsXHJcbiAgICAgICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cikge1xyXG4gICAgICAgICAgICAgICAgdmFyIGdldHRlciA9ICRwYXJzZShhdHRyLmViQ2xhc3MpLFxyXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzZXMgPSBbXTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIHVuYmluZCA9IHNjb3BlLiR3YXRjaCgnbm9kZS5hdHRyaWJ1dGVzJywgZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWwgPSBnZXR0ZXIoc2NvcGUpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc2VzVG9SZW1vdmUgPSBjbGFzc2VzLmpvaW4oJyAnKTtcclxuICAgICAgICAgICAgICAgICAgICBjbGFzc2VzID0gW107XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgc2V0Q2xhc3Nlcyh2YWwpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2xhc3MoY2xhc3Nlc1RvUmVtb3ZlKTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmFkZENsYXNzKGNsYXNzZXMuam9pbignICcpKTtcclxuICAgICAgICAgICAgICAgIH0sIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHVuYmluZCgpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIHNldENsYXNzZXMgKG9iamVjdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmKCFvYmplY3QpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q2xhc3Moa2V5LCBvYmplY3Rba2V5XSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBzZXRDbGFzcyh2YWx1ZSwgcHJlZGljYXRlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHV0aWxzLmlzRnVuY3Rpb24ocHJlZGljYXRlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJlZGljYXRlKHNjb3BlLm5vZGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc2VzLnB1c2godmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZWRpY2F0ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKHZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhbmd1bGFyKSB7XHJcblxyXG4gICAgYW5ndWxhci5tb2R1bGUoJ2V4cHJlc3Npb24tYnVpbGRlcicpLmRpcmVjdGl2ZSgnZWJFeHByZXNzaW9uJywgRGlyZWN0aXZlKTtcclxuXHJcbiAgICBEaXJlY3RpdmUuJGluamVjdCA9IFsnJHRlbXBsYXRlQ2FjaGUnLCAnJGNvbXBpbGUnXTtcclxuXHJcbiAgICBmdW5jdGlvbiBEaXJlY3RpdmUoJHRlbXBsYXRlQ2FjaGUsICRjb21waWxlKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgcmVzdHJpY3Q6ICdBJyxcclxuICAgICAgICAgICAgc2NvcGU6IHtcclxuICAgICAgICAgICAgICAgIGV4cHJlc3Npb246ICc9ZWJFeHByZXNzaW9uJ1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIpIHtcclxuICAgICAgICAgICAgICAgIHZhciB0ZW1wbGF0ZSA9ICR0ZW1wbGF0ZUNhY2hlLmdldChzY29wZS5leHByZXNzaW9uLnRlbXBsYXRlKTtcclxuICAgICAgICAgICAgICAgIHZhciBleHByZXNzaW9uID0gJGNvbXBpbGUodGVtcGxhdGUpKHNjb3BlKTtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQuYXBwZW5kKGV4cHJlc3Npb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59OyIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFuZ3VsYXIpIHtcclxuICAgIGFuZ3VsYXIubW9kdWxlKCdleHByZXNzaW9uLWJ1aWxkZXInKS5kaXJlY3RpdmUoJ2ViTm9kZScsIERpcmVjdGl2ZSk7XHJcblxyXG4gICAgRGlyZWN0aXZlLiRpbmplY3QgPSBbXTtcclxuXHJcbiAgICBmdW5jdGlvbiBEaXJlY3RpdmUoKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgcmVzdHJpY3Q6ICdBJyxcclxuICAgICAgICAgICAgc2NvcGU6IHtcclxuICAgICAgICAgICAgICAgIG5vZGU6ICc9ZWJOb2RlJ1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB0ZW1wbGF0ZVVybDogJ2ViLW5vZGUuaHRtbCcsXHJcbiAgICAgICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cikge1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59OyIsIm1vZHVsZS5leHBvcnRzID0gR3JvdXA7XHJcblxyXG5mdW5jdGlvbiBHcm91cCgpIHtcclxuICAgIHRoaXMuZXhwcmVzc2lvbnMgPSBbXTtcclxuICAgIHRoaXMudGVtcGxhdGUgPSAnZWItZ3JvdXAuaHRtbCc7XHJcbn1cclxuIiwidmFyIHV0aWxpdHkgPSByZXF1aXJlKCcuL3V0aWxzJyksXHJcbiAgICBOb2RlID0gcmVxdWlyZSgnLi4vYnVpbGRlci9ub2RlJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IERlc2VyaWFsaXphdGlvblNlcnZpY2U7XHJcblxyXG5mdW5jdGlvbiB0cmF2ZXJzZShub2RlLCBtYXApIHtcclxuICAgIGlmICghbWFwLmhhc093blByb3BlcnR5KG5vZGUuaWQpKSB7XHJcbiAgICAgICAgbWFwW25vZGUuaWRdID0gbm9kZTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gbm9kZS5jaGlsZHJlbi5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBjaGlsZCA9IG5vZGUuY2hpbGRyZW5bMF1cclxuICAgICAgICB0cmF2ZXJzZShjaGlsZCwgbWFwKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gRGVzZXJpYWxpemF0aW9uU2VydmljZShzY2hlbWEpIHtcclxuICAgIGZ1bmN0aW9uIGRlc2VyaWFsaXplKGRhdGEsIHBhcmVudCwgbm9kZU1hcCkge1xyXG4gICAgICAgIG5vZGVNYXAgPSBub2RlTWFwIHx8IHt9O1xyXG5cclxuICAgICAgICBpZiAoIXBhcmVudCkge1xyXG4gICAgICAgICAgICB2YXIgbm9kZSA9IG5ldyBOb2RlKGRhdGEuaWQsIHNjaGVtYSk7XHJcbiAgICAgICAgICAgIHNjaGVtYS5hcHBseShub2RlKTtcclxuICAgICAgICAgICAgdHJhdmVyc2Uobm9kZSwgbm9kZU1hcCk7XHJcbiAgICAgICAgICAgIG5vZGUuY2xlYXIoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgbm9kZSA9IG5vZGVNYXBbZGF0YS5pZF07XHJcbiAgICAgICAgICAgIG5vZGUgPSBub2RlLmNsb25lKCk7XHJcbiAgICAgICAgICAgIHBhcmVudC5hZGRDaGlsZEFmdGVyKG5vZGUpO1xyXG4gICAgICAgICAgICB0cmF2ZXJzZShwYXJlbnQsIG5vZGVNYXApO1xyXG4gICAgICAgICAgICBub2RlLmNsZWFyKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBub2RlLmF0dHJpYnV0ZXMgPSBkYXRhLmF0dHJpYnV0ZXM7XHJcbiAgICAgICAgZGVzZXJpYWxpemVMaW5lKG5vZGUsIG5vZGUubGluZSwgZGF0YS5saW5lKTtcclxuXHJcbiAgICAgICAgdmFyIGNoaWxkcmVuID0gZGF0YS5jaGlsZHJlbixcclxuICAgICAgICAgICAgbGVuZ3RoID0gY2hpbGRyZW4ubGVuZ3RoO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBjaGlsZCA9IGNoaWxkcmVuW2ldO1xyXG4gICAgICAgICAgICBuZXcgRGVzZXJpYWxpemF0aW9uU2VydmljZShzY2hlbWEuc2NoZW1hTWFwW2NoaWxkLmlkXSkuZGVzZXJpYWxpemUoY2hpbGQsIG5vZGUsIG5vZGVNYXApO1xyXG5cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBub2RlO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRlc2VyaWFsaXplTGluZShub2RlLCBsaW5lLCBkYXRhTGluZSkge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBkYXRhTGluZS5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB2YXIgc2VyaWFsaXplZEdyb3VwID0gZGF0YUxpbmVbaV07XHJcblxyXG4gICAgICAgICAgICBkZXNlcmlhbGl6ZUdyb3VwKG5vZGUsIGxpbmUsIGxpbmUuZ2V0KHNlcmlhbGl6ZWRHcm91cC5pZCksIHNlcmlhbGl6ZWRHcm91cCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRlc2VyaWFsaXplR3JvdXAobm9kZSwgbGluZSwgZ3JvdXAsIGRhdGFHcm91cCkge1xyXG4gICAgICAgIHZhciBzZXJpYWxpemVkRXhwcmVzc2lvbnMgPSBkYXRhR3JvdXAuZXhwcmVzc2lvbnMsXHJcbiAgICAgICAgICAgIGxlbmd0aCA9IHNlcmlhbGl6ZWRFeHByZXNzaW9ucy5sZW5ndGg7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIHNlcmlhbGl6ZWRFeHAgPSBzZXJpYWxpemVkRXhwcmVzc2lvbnNbaV07XHJcblxyXG4gICAgICAgICAgICB2YXIgaW5kZXggPSB1dGlsaXR5LmluZGV4T2YoZ3JvdXAuZXhwcmVzc2lvbnMsIGZ1bmN0aW9uIChleHByZXNzaW9uKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwcmVzc2lvbi5pZCA9PT0gc2VyaWFsaXplZEV4cC5pZDtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICB1dGlsaXR5Lm92ZXJyaWRlKGdyb3VwLmV4cHJlc3Npb25zW2luZGV4XSwgc2VyaWFsaXplZEV4cCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChzZXJpYWxpemVkRXhwcmVzc2lvbnNbaV0ubWV0aG9kKSB7XHJcbiAgICAgICAgICAgICAgICBzZXJpYWxpemVkRXhwcmVzc2lvbnNbaV0ubWV0aG9kLmZvckVhY2goZnVuY3Rpb24gKG0pIHtcclxuICAgICAgICAgICAgICAgICAgICBncm91cC5leHByZXNzaW9uc1tpbmRleF1bbV0obm9kZSwgbGluZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXAuZXhwcmVzc2lvbnNbaW5kZXhdLm1ldGhvZCA9IHNlcmlhbGl6ZWRFeHByZXNzaW9uc1tpXS5tZXRob2Q7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmRlc2VyaWFsaXplID0gZGVzZXJpYWxpemU7XHJcbn1cclxuIiwidmFyIHV0aWxpdHkgPSByZXF1aXJlKCcuL3V0aWxzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIG1ldGhvZDogbWV0aG9kLFxyXG4gICAgbWV0aG9kc09mOiBtZXRob2RzT2ZcclxufTtcclxuXHJcbmZ1bmN0aW9uIG1ldGhvZChvYmplY3QsIGtleSkge1xyXG4gICAgdmFyIHNvdXJjZUZ1bmN0aW9uID0gb2JqZWN0W2tleV07XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB3aXRoOiB3aXRoRmFjdG9yeShvYmplY3QsIGtleSwgc291cmNlRnVuY3Rpb24pXHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG1ldGhvZHNPZihvYmopIHtcclxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKSxcclxuICAgICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcclxuICAgICAgICBwYXRjaCA9IHt9O1xyXG5cclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuXHJcbiAgICAgICAgaWYgKHV0aWxpdHkuaXNGdW5jdGlvbihvYmpba2V5XSkpIHtcclxuICAgICAgICAgICAgcGF0Y2hba2V5XSA9IG1ldGhvZChvYmosIGtleSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgd2l0aDogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHBhdGNoKSxcclxuICAgICAgICAgICAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxyXG4gICAgICAgICAgICAgICAgYXJncyA9IHV0aWxpdHkuYXNBcnJheShhcmd1bWVudHMpO1xyXG5cclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgICAgICAgICBvYmouYWN0aW9uID0ga2V5O1xyXG4gICAgICAgICAgICAgICAgcGF0Y2hba2V5XS53aXRoLmFwcGx5KG9iaiwgYXJncyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdpdGhGYWN0b3J5KG9iamVjdCwga2V5LCBzb3VyY2VGdW5jdGlvbikge1xyXG4gICAgdmFyIHdpdGhGdW5jdGlvbiA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICB2YXIgYXJncyA9IHV0aWxpdHkuYXNBcnJheShhcmd1bWVudHMpO1xyXG5cclxuICAgICAgICBvYmplY3Rba2V5XSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHNvdXJjZUZ1bmN0aW9uLmFwcGx5KG9iamVjdCwgYXJncyk7XHJcbiAgICAgICAgfTtcclxuICAgIH07XHJcblxyXG4gICAgd2l0aEZ1bmN0aW9uLmRlY29yYXRvciA9IGZ1bmN0aW9uIChkZWNvcmF0ZSkge1xyXG4gICAgICAgIHZhciBhcmdzID0gdXRpbGl0eS5hc0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSk7XHJcblxyXG4gICAgICAgIG9iamVjdFtrZXldID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZGVjb3JhdGUuYXBwbHkob2JqZWN0LCBbc291cmNlRnVuY3Rpb24sIG9iamVjdCwga2V5XS5jb25jYXQoYXJncykpO1xyXG4gICAgICAgIH07XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiB3aXRoRnVuY3Rpb247XHJcbn1cclxuIiwidmFyIHV0aWxpdHkgPSByZXF1aXJlKCcuL3V0aWxzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNlcmlhbGl6YXRpb25TZXJ2aWNlO1xyXG5cclxuZnVuY3Rpb24gU2VyaWFsaXphdGlvblNlcnZpY2Uobm9kZSkge1xyXG4gICAgZnVuY3Rpb24gc2VyaWFsaXplKCkge1xyXG4gICAgICAgIHZhciBncm91cHMgPSBub2RlLmxpbmUuZXhwcmVzc2lvbnMubWFwKHNlcmlhbGl6ZUdyb3VwKTtcclxuICAgICAgICB2YXIgYXR0cnMgPSB1dGlsaXR5LmNsb25lKG5vZGUuYXR0cmlidXRlcyk7XHJcbiAgICAgICAgZGVsZXRlIGF0dHJzLnNlcmlhbGl6ZTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaWQ6IG5vZGUuaWQsXHJcbiAgICAgICAgICAgIGF0dHJpYnV0ZXM6IGF0dHJzLFxyXG4gICAgICAgICAgICBjaGlsZHJlbjogbm9kZS5jaGlsZHJlbi5tYXAoZnVuY3Rpb24gKGNoaWxkKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFNlcmlhbGl6YXRpb25TZXJ2aWNlKGNoaWxkKS5zZXJpYWxpemUoKTtcclxuICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgIGxpbmU6IGdyb3Vwcy5maWx0ZXIoZnVuY3Rpb24gKGdyb3VwKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZ3JvdXAuZXhwcmVzc2lvbnMubGVuZ3RoO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBzZXJpYWxpemVHcm91cChncm91cCkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGlkOiBncm91cC5pZCxcclxuICAgICAgICAgICAgZXhwcmVzc2lvbnM6IGdyb3VwLmV4cHJlc3Npb25zXHJcbiAgICAgICAgICAgICAgICAuZmlsdGVyKHNlcmlhbGl6YWJsZSlcclxuICAgICAgICAgICAgICAgIC5tYXAoc2VyaWFsaXplRXhwcmVzc2lvbilcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc2VyaWFsaXphYmxlKGV4cHJlc3Npb24pIHtcclxuICAgICAgICB2YXIgc2VyaWFsaXplQXR0ciA9IG5vZGUuYXR0cignc2VyaWFsaXplJyk7XHJcbiAgICAgICAgaWYgKCFzZXJpYWxpemVBdHRyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBwcm9wZXJ0aWVzVG9TZXJpYWxpemUgPSBzZXJpYWxpemVBdHRyW2V4cHJlc3Npb24uaWRdO1xyXG5cclxuICAgICAgICByZXR1cm4gcHJvcGVydGllc1RvU2VyaWFsaXplICYmIHByb3BlcnRpZXNUb1NlcmlhbGl6ZS5sZW5ndGg7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc2VyaWFsaXplRXhwcmVzc2lvbihleHByZXNzaW9uKSB7XHJcbiAgICAgICAgdmFyIHNlcmlhbGl6ZUF0dHIgPSBub2RlLmF0dHIoJ3NlcmlhbGl6ZScpO1xyXG5cclxuICAgICAgICB2YXIgcmVzdWx0ID0ge30sXHJcbiAgICAgICAgICAgIHByb3BlcnRpZXNUb1NlcmlhbGl6ZSA9IHNlcmlhbGl6ZUF0dHJbZXhwcmVzc2lvbi5pZF07XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBwcm9wZXJ0aWVzVG9TZXJpYWxpemUubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIHByb3AgPSBwcm9wZXJ0aWVzVG9TZXJpYWxpemVbaV07XHJcbiAgICAgICAgICAgIHJlc3VsdFtwcm9wXSA9IGV4cHJlc3Npb25bcHJvcF07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJlc3VsdC5pZCA9IGV4cHJlc3Npb24uaWQ7XHJcbiAgICAgICAgcmVzdWx0LnR5cGUgPSBleHByZXNzaW9uLnR5cGU7XHJcbiAgICAgICAgcmVzdWx0Lm1ldGhvZCA9IGV4cHJlc3Npb24ubWV0aG9kO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuc2VyaWFsaXplID0gc2VyaWFsaXplO1xyXG59XHJcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgYXNBcnJheTogYXNBcnJheSxcclxuICAgIGNsb25lOiBjbG9uZSxcclxuICAgIGRlZmF1bHRzOiBkZWZhdWx0cyxcclxuICAgIGluZGV4T2Y6IGluZGV4T2YsXHJcbiAgICBpc0FycmF5OiBBcnJheS5pc0FycmF5LFxyXG4gICAgaXNGdW5jdGlvbjogaXNGdW5jdGlvbixcclxuICAgIGlzT2JqZWN0OiBpc09iamVjdCxcclxuICAgIG92ZXJyaWRlOiBvdmVycmlkZVxyXG59O1xyXG5cclxuZnVuY3Rpb24gaW5kZXhPZihhcnJheSwgcHJlZGljYXRlKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAocHJlZGljYXRlKGFycmF5W2ldLCBpKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gaTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gLTE7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFzQXJyYXkoYXJncykge1xyXG4gICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3MpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjbG9uZShvYmplY3QpIHtcclxuICAgIHZhciByZXN1bHQgPSB7fSxcclxuICAgICAgICBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcclxuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgcmVzdWx0W2tleV0gPSBvYmplY3Rba2V5XVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlZmF1bHRzKGRzdCkge1xyXG4gICAgdmFyIHNvdXJjZXNMZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoO1xyXG4gICAgdmFyIGFyZ3MgPSBhc0FycmF5KGFyZ3VtZW50cyk7XHJcbiAgICB2YXIgcmVzdWx0ID0gY2xvbmUoZHN0KTtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IHNvdXJjZXNMZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBzb3VyY2UgPSBhcmdzW2ldO1xyXG5cclxuICAgICAgICBpZiAoIXNvdXJjZSkge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoc291cmNlKTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgayA9IDAsIGtleXNMZW5ndGggPSBrZXlzLmxlbmd0aDsgayA8IGtleXNMZW5ndGg7IGsrKykge1xyXG4gICAgICAgICAgICB2YXIga2V5ID0ga2V5c1trXTtcclxuICAgICAgICAgICAgaWYgKCFyZXN1bHQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0W2tleV0gPSBzb3VyY2Vba2V5XTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKHZhbHVlKSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xyXG4gICAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG92ZXJyaWRlKGRzdCwgc3JjKSB7XHJcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHNyYyksXHJcbiAgICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XHJcblxyXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgZHN0W2tleV0gPSBzcmNba2V5XTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZHN0O1xyXG59XHJcbiJdfQ==

angular.module("expression-builder").run(["$templateCache", function($templateCache) {$templateCache.put("eb-group.html","<ul class=\"expression-builder-group\">\r\n    <li ng-repeat=\"exp in expression.expressions\"\r\n        ng-if=\"exp.isVisible()\"\r\n        eb-expression=\"exp\"\r\n        class=\"expression-builder-expression\">\r\n    </li>\r\n</ul>");
$templateCache.put("eb-node.html","<ul class=\"expression-builder-node\" eb-class=\"node.attr(\'class\')\">\r\n    <li ng-repeat=\"expression in node.line.expressions\"\r\n        eb-expression=\"expression\"\r\n        class=\"expression-builder-expression\">\r\n    </li>\r\n\r\n    <li ng-repeat=\"child in node.children\" eb-node=\"child\" class=\"expression-builder-child\">\r\n    </li>\r\n</ul>");}]);