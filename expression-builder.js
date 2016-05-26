(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (angular, undefined) {

   var module = angular.module('expression-builder', []);

   require('./builder/expression-builder')(angular);
   require('./model/eb-expression')(angular);
   require('./model/eb-node')(angular);
   require('./model/eb-class')(angular);

   var SerializationService = require('./services/serialization'),
       DeserializationService = require('./services/deserialization'),
       TraverseService = require('./services/traverse');

   module
       .factory('expressionBuilderSerializer', [function () {
      return {
         serialize: function (node) {
            return new SerializationService(node).serialize();
         },
         deserialize: function (schema, data) {
            return new DeserializationService(schema).deserialize(data);
         }
      }
   }])
       .service('expressionBuilderTraverse', [TraverseService]);

})(angular);
},{"./builder/expression-builder":2,"./model/eb-class":7,"./model/eb-expression":8,"./model/eb-node":9,"./services/deserialization":11,"./services/serialization":13,"./services/traverse":14}],2:[function(require,module,exports){
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
},{"../model/expression-group":10,"../services/patch":12,"../services/utils":15,"./group-schema":3,"./node-schema":5}],3:[function(require,module,exports){
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
},{"../model/expression-group":10,"../services/utils":15}],5:[function(require,module,exports){
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
},{"../services/utils":15}],7:[function(require,module,exports){
var utils = require('../services/utils');

module.exports = function (angular) {
    angular.module('expression-builder').directive('ebClass', Directive);

    Directive.$inject = ['$parse'];

    function Directive($parse) {
        return {
            restrict: 'A',
            link: function (scope, element, attr) {
                var getter = $parse(attr.ebClass),
                    classes = '';

                var unbind = scope.$watch(evaluateClassObject, function (value) {
                    if(value) {
                        var oldClasses = classes;
                        var newClasses = fetchClasses(value).join(' ');
                        if (oldClasses !== newClasses) {
                            classes = newClasses;
                            element.removeClass(oldClasses);
                            element.addClass(classes);
                        }
                    }
                    else{
                        element.removeClass(classes);
                        classes = '';
                    }
                }, true);

                function evaluateClassObject() {
                    var classObject = getter(scope);

                    if (!classObject) {
                        return null;
                    }

                    var keys = Object.keys(classObject),
                        result = {},
                        length = keys.length;

                    for (var i = 0; i < length; i++) {
                        var key = keys[i],
                            value = classObject[key];
                        if (utils.isFunction(value)) {
                            result[key] = value(scope.node);
                        } else {
                            result[key] = value;
                        }
                    }

                    return result;
                }

                function fetchClasses(object) {
                    var keys = Object.keys(object),
                        length = keys.length,
                        classes = [];

                    for (var i = 0; i < length; i++) {
                        var key = keys[i];
                        if (object[key]) {
                            classes.push(key);
                        }
                    }

                    return classes;
                }

                scope.$on('$destroy', function () {
                    unbind();
                });

            }
        }
    }
};
},{"../services/utils":15}],8:[function(require,module,exports){
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

        utility.override(node.attributes, data.attributes);

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

},{"../builder/node":6,"./utils":15}],12:[function(require,module,exports){
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

},{"./utils":15}],13:[function(require,module,exports){
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

},{"./utils":15}],14:[function(require,module,exports){
module.exports = TraverseService;

function TraverseService() {
    function visitLine(reduce, memo, node, line) {
        var groups = line.expressions,
            length = groups.length;

        for (var i = 0; i < length; i++) {
            memo = visitGroup(reduce, memo, node, line, groups[i]);
        }

        return memo;
    }

    function visitGroup(reduce, memo, node, line, group) {
        var expressions = group.expressions,
            length = expressions.length;

        for (var i = 0; i < length; i++) {
            memo = reduce(memo, expressions[i], line, node);
        }

        return memo;
    }

    this.depth = function (root) {
        var self = this;

        return function (reduce, memo) {
            memo = visitLine(reduce, memo, root, root.line);

            var children = root.children,
                length = children.length;

            for (var i = 0; i < length; i++) {
                memo = self.depth(children[i])(reduce, memo);
            }

            return memo;
        };
    };

}

},{}],15:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYm9vdHN0cmFwLmpzIiwic3JjL2J1aWxkZXIvZXhwcmVzc2lvbi1idWlsZGVyLmpzIiwic3JjL2J1aWxkZXIvZ3JvdXAtc2NoZW1hLmpzIiwic3JjL2J1aWxkZXIvbGluZS5qcyIsInNyYy9idWlsZGVyL25vZGUtc2NoZW1hLmpzIiwic3JjL2J1aWxkZXIvbm9kZS5qcyIsInNyYy9tb2RlbC9lYi1jbGFzcy5qcyIsInNyYy9tb2RlbC9lYi1leHByZXNzaW9uLmpzIiwic3JjL21vZGVsL2ViLW5vZGUuanMiLCJzcmMvbW9kZWwvZXhwcmVzc2lvbi1ncm91cC5qcyIsInNyYy9zZXJ2aWNlcy9kZXNlcmlhbGl6YXRpb24uanMiLCJzcmMvc2VydmljZXMvcGF0Y2guanMiLCJzcmMvc2VydmljZXMvc2VyaWFsaXphdGlvbi5qcyIsInNyYy9zZXJ2aWNlcy90cmF2ZXJzZS5qcyIsInNyYy9zZXJ2aWNlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uIChhbmd1bGFyLCB1bmRlZmluZWQpIHtcclxuXHJcbiAgIHZhciBtb2R1bGUgPSBhbmd1bGFyLm1vZHVsZSgnZXhwcmVzc2lvbi1idWlsZGVyJywgW10pO1xyXG5cclxuICAgcmVxdWlyZSgnLi9idWlsZGVyL2V4cHJlc3Npb24tYnVpbGRlcicpKGFuZ3VsYXIpO1xyXG4gICByZXF1aXJlKCcuL21vZGVsL2ViLWV4cHJlc3Npb24nKShhbmd1bGFyKTtcclxuICAgcmVxdWlyZSgnLi9tb2RlbC9lYi1ub2RlJykoYW5ndWxhcik7XHJcbiAgIHJlcXVpcmUoJy4vbW9kZWwvZWItY2xhc3MnKShhbmd1bGFyKTtcclxuXHJcbiAgIHZhciBTZXJpYWxpemF0aW9uU2VydmljZSA9IHJlcXVpcmUoJy4vc2VydmljZXMvc2VyaWFsaXphdGlvbicpLFxyXG4gICAgICAgRGVzZXJpYWxpemF0aW9uU2VydmljZSA9IHJlcXVpcmUoJy4vc2VydmljZXMvZGVzZXJpYWxpemF0aW9uJyksXHJcbiAgICAgICBUcmF2ZXJzZVNlcnZpY2UgPSByZXF1aXJlKCcuL3NlcnZpY2VzL3RyYXZlcnNlJyk7XHJcblxyXG4gICBtb2R1bGVcclxuICAgICAgIC5mYWN0b3J5KCdleHByZXNzaW9uQnVpbGRlclNlcmlhbGl6ZXInLCBbZnVuY3Rpb24gKCkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgICBzZXJpYWxpemU6IGZ1bmN0aW9uIChub2RlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgU2VyaWFsaXphdGlvblNlcnZpY2Uobm9kZSkuc2VyaWFsaXplKCk7XHJcbiAgICAgICAgIH0sXHJcbiAgICAgICAgIGRlc2VyaWFsaXplOiBmdW5jdGlvbiAoc2NoZW1hLCBkYXRhKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGVzZXJpYWxpemF0aW9uU2VydmljZShzY2hlbWEpLmRlc2VyaWFsaXplKGRhdGEpO1xyXG4gICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgfV0pXHJcbiAgICAgICAuc2VydmljZSgnZXhwcmVzc2lvbkJ1aWxkZXJUcmF2ZXJzZScsIFtUcmF2ZXJzZVNlcnZpY2VdKTtcclxuXHJcbn0pKGFuZ3VsYXIpOyIsInZhciBub2RlU2NoZW1hRmFjdG9yeVQgPSByZXF1aXJlKCcuL25vZGUtc2NoZW1hJyksXHJcblx0IGdyb3VwU2NoZW1hRmFjdG9yeVQgPSByZXF1aXJlKCcuL2dyb3VwLXNjaGVtYScpLFxyXG5cdCBwYXRjaCA9IHJlcXVpcmUoJy4uL3NlcnZpY2VzL3BhdGNoJyksXHJcblx0IHV0aWxpdHkgPSByZXF1aXJlKCcuLi9zZXJ2aWNlcy91dGlscycpLFxyXG5cdCBFeHByZXNzaW9uR3JvdXAgPSByZXF1aXJlKCcuLi9tb2RlbC9leHByZXNzaW9uLWdyb3VwJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhbmd1bGFyKSB7XHJcblx0YW5ndWxhci5tb2R1bGUoJ2V4cHJlc3Npb24tYnVpbGRlcicpLmZhY3RvcnkoJ0V4cHJlc3Npb25CdWlsZGVyJywgRmFjdG9yeSk7XHJcblx0RmFjdG9yeS4kaW5qZWN0ID0gW107XHJcblxyXG5cdGZ1bmN0aW9uIEZhY3RvcnkoKSB7XHJcblx0XHRmdW5jdGlvbiBFeHByZXNzaW9uQnVpbGRlcihleHByZXNzaW9ucywgZ2xvYmFsU2V0dGluZ3MpIHtcclxuXHRcdFx0dmFyIEdyb3VwU2NoZW1hID0gZ3JvdXBTY2hlbWFGYWN0b3J5VCgpO1xyXG5cdFx0XHR2YXIgTm9kZVNjaGVtYSA9IG5vZGVTY2hlbWFGYWN0b3J5VChHcm91cFNjaGVtYSk7XHJcblxyXG5cdFx0XHRleHByZXNzaW9ucy5mb3JFYWNoKGZ1bmN0aW9uIChzZXR0aW5ncykge1xyXG5cdFx0XHRcdHZhciBmYWN0b3J5ID0gZnVuY3Rpb24gKGlkLCBwYXJhbWV0ZXJzKSB7XHJcblxyXG5cdFx0XHRcdFx0dmFyIGJ1aWxkID0gZnVuY3Rpb24gKG5vZGUsIGxpbmUpIHtcclxuXHRcdFx0XHRcdFx0dmFyIGV4cHJlc3Npb24gPSB1dGlsaXR5LmRlZmF1bHRzKHBhcmFtZXRlcnMsIHNldHRpbmdzLmRlZmF1bHRzLCBnbG9iYWxTZXR0aW5ncy5kZWZhdWx0cyk7XHJcblx0XHRcdFx0XHRcdGV4cHJlc3Npb24uaWQgPSBpZDtcclxuXHRcdFx0XHRcdFx0ZXhwcmVzc2lvbi50eXBlID0gc2V0dGluZ3MudHlwZTtcclxuXHJcblx0XHRcdFx0XHRcdHZhciBncm91cCA9IG5ldyBFeHByZXNzaW9uR3JvdXAoKTtcclxuXHRcdFx0XHRcdFx0Z3JvdXAuaWQgPSBpZDtcclxuXHRcdFx0XHRcdFx0Z3JvdXAuZXhwcmVzc2lvbnMucHVzaChleHByZXNzaW9uKTtcclxuXHRcdFx0XHRcdFx0ZXhwcmVzc2lvbi50ZW1wbGF0ZSA9IHNldHRpbmdzLnRlbXBsYXRlVXJsO1xyXG5cdFx0XHRcdFx0XHRsaW5lLmFkZChncm91cCk7XHJcblxyXG5cdFx0XHRcdFx0XHRwYXRjaC5tZXRob2RzT2YoZXhwcmVzc2lvbikud2l0aChub2RlLCBsaW5lKTtcclxuXHJcblx0XHRcdFx0XHRcdHZhciBrZXlzID0gT2JqZWN0LmtleXMoZXhwcmVzc2lvbik7XHJcblxyXG5cdFx0XHRcdFx0XHRrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG5cdFx0XHRcdFx0XHRcdHZhciBzb3VyY2VGdW5jdGlvbiA9IGV4cHJlc3Npb25ba2V5XTtcclxuXHJcblx0XHRcdFx0XHRcdFx0aWYgKHV0aWxpdHkuaXNGdW5jdGlvbihzb3VyY2VGdW5jdGlvbikpIHtcclxuXHRcdFx0XHRcdFx0XHRcdGV4cHJlc3Npb25ba2V5XSA9IGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0dmFyIHJlc3VsdCA9IHNvdXJjZUZ1bmN0aW9uKCk7XHJcblxyXG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBUT0RPIGFkZCBkZWNvcmF0b3IgZm9yIG11dHRhYmxlIG1ldGhvZHMgaW5zdGVhZCBvZiB0cmlnZ2VyXHJcblx0XHRcdFx0XHRcdFx0XHRcdGlmICghbGluZS5pbW11dGFibGUpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRleHByZXNzaW9uLm1ldGhvZCA9IGV4cHJlc3Npb24ubWV0aG9kIHx8IFtdO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChleHByZXNzaW9uLm1ldGhvZC5pbmRleE9mKGtleSkgPCAwKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRleHByZXNzaW9uLm1ldGhvZC5wdXNoKGtleSk7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRsaW5lLmltbXV0YWJsZSA9IHRydWU7XHJcblx0XHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcclxuXHRcdFx0XHRcdFx0XHRcdH07XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9KTtcclxuXHJcblx0XHRcdFx0XHRcdHJldHVybiBub2RlO1xyXG5cdFx0XHRcdFx0fTtcclxuXHJcblx0XHRcdFx0XHR0aGlzLnBsYW4ucHVzaChidWlsZCk7XHJcblx0XHRcdFx0XHR0aGlzLnBsYW5NYXBbaWRdID0gYnVpbGQ7XHJcblxyXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHRcdFx0fTtcclxuXHJcblx0XHRcdFx0dmFyIGdyb3VwRmFjdG9yeSA9IGZ1bmN0aW9uIChpZCwgcGFyYW1ldGVycykge1xyXG5cclxuXHRcdFx0XHRcdHZhciBidWlsZCA9IGZ1bmN0aW9uIChub2RlLCBsaW5lLCBleHByZXNzaW9uR3JvdXApIHtcclxuXHRcdFx0XHRcdFx0dmFyIGV4cHJlc3Npb24gPSB1dGlsaXR5LmRlZmF1bHRzKHBhcmFtZXRlcnMsIHNldHRpbmdzLmRlZmF1bHRzLCBnbG9iYWxTZXR0aW5ncy5kZWZhdWx0cyk7XHJcblx0XHRcdFx0XHRcdGV4cHJlc3Npb24uaWQgPSBpZDtcclxuXHRcdFx0XHRcdFx0ZXhwcmVzc2lvbi50eXBlID0gc2V0dGluZ3MudHlwZTtcclxuXHRcdFx0XHRcdFx0ZXhwcmVzc2lvbi50ZW1wbGF0ZSA9IHNldHRpbmdzLnRlbXBsYXRlVXJsO1xyXG5cdFx0XHRcdFx0XHRleHByZXNzaW9uR3JvdXAuZXhwcmVzc2lvbnMucHVzaChleHByZXNzaW9uKTtcclxuXHJcblx0XHRcdFx0XHRcdHBhdGNoLm1ldGhvZHNPZihleHByZXNzaW9uKS53aXRoKG5vZGUsIGxpbmUpO1xyXG5cclxuXHRcdFx0XHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHRcdFx0XHR9O1xyXG5cclxuXHRcdFx0XHRcdHRoaXMucGxhbi5wdXNoKGJ1aWxkKTtcclxuXHJcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcclxuXHRcdFx0XHR9O1xyXG5cclxuXHRcdFx0XHROb2RlU2NoZW1hLnByb3RvdHlwZVtzZXR0aW5ncy50eXBlXSA9IGZhY3Rvcnk7XHJcblx0XHRcdFx0R3JvdXBTY2hlbWEucHJvdG90eXBlW3NldHRpbmdzLnR5cGVdID0gZ3JvdXBGYWN0b3J5O1xyXG5cdFx0XHR9KTtcclxuXHJcblx0XHRcdHJldHVybiBuZXcgTm9kZVNjaGVtYSgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBFeHByZXNzaW9uQnVpbGRlcjtcclxuXHR9XHJcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgIGZ1bmN0aW9uIEdyb3VwU2NoZW1hKG5vZGUsIGxpbmUpIHtcclxuICAgICAgdGhpcy5wbGFuID0gW107XHJcbiAgICAgIHRoaXMubGluZSA9IGxpbmU7XHJcbiAgICAgIHRoaXMubm9kZSA9IG5vZGU7XHJcbiAgIH1cclxuXHJcbiAgIEdyb3VwU2NoZW1hLnByb3RvdHlwZS5hcHBseSA9IGZ1bmN0aW9uIChleHByZXNzaW9uR3JvdXApIHtcclxuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgICB0aGlzLnBsYW4uZm9yRWFjaChmdW5jdGlvbiAocCkge1xyXG4gICAgICAgICBwKHNlbGYubm9kZSwgc2VsZi5saW5lLCBleHByZXNzaW9uR3JvdXApO1xyXG4gICAgICB9KTtcclxuICAgfTtcclxuXHJcbiAgIHJldHVybiBHcm91cFNjaGVtYTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBMaW5lO1xyXG5cclxudmFyIEV4cHJlc3Npb25Hcm91cCA9IHJlcXVpcmUoJy4uL21vZGVsL2V4cHJlc3Npb24tZ3JvdXAnKSxcclxuXHQgdXRpbGl0eSA9IHJlcXVpcmUoJy4uL3NlcnZpY2VzL3V0aWxzJyk7XHJcblxyXG5mdW5jdGlvbiBMaW5lKEdyb3VwU2NoZW1hKSB7XHJcblx0dGhpcy5leHByZXNzaW9ucyA9IFtdO1xyXG5cclxuXHQvLyBUT0RPIGFkZCBkZWNvcmF0b3IgZm9yIG11dHRhYmxlIG1ldGhvZHMgaW5zdGVhZCBvZiB0cmlnZ2VyXHJcblx0dGhpcy5pbW11dGFibGUgPSB0cnVlO1xyXG5cclxuXHR2YXIgZ2V0SW5kZXggPSAoZnVuY3Rpb24gKGlkKSB7XHJcblx0XHR2YXIgaW5kZXggPSB1dGlsaXR5LmluZGV4T2YodGhpcy5leHByZXNzaW9ucywgZnVuY3Rpb24gKGl0ZW0pIHtcclxuXHRcdFx0cmV0dXJuIGl0ZW0uaWQgPT09IGlkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0aWYgKGluZGV4IDwgMCkge1xyXG5cdFx0XHR0aHJvdyBFcnJvcignRXhwcmVzc2lvbiAnICsgaWQgKyAnIG5vdCBmb3VuZCcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBpbmRleDtcclxuXHR9KS5iaW5kKHRoaXMpO1xyXG5cclxuXHR0aGlzLmFkZCA9IGZ1bmN0aW9uIChleHByZXNzaW9uKSB7XHJcblx0XHR0aGlzLmV4cHJlc3Npb25zLnB1c2goZXhwcmVzc2lvbik7XHJcblx0fTtcclxuXHJcblx0dGhpcy5jbG9uZSA9IGZ1bmN0aW9uIChpZCkge1xyXG5cdFx0cmV0dXJuIGFuZ3VsYXIuY29weSh0aGlzLmdldChpZCkpO1xyXG5cdH07XHJcblxyXG5cdHRoaXMuZ2V0ID0gZnVuY3Rpb24gKGlkKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5leHByZXNzaW9uc1tnZXRJbmRleChpZCldO1xyXG5cdH07XHJcblxyXG5cdHRoaXMucHV0ID0gZnVuY3Rpb24gKGlkLCBub2RlLCBidWlsZCkge1xyXG5cdFx0dmFyIGluZGV4ID0gZ2V0SW5kZXgoaWQpLFxyXG5cdFx0XHQgc2NoZW1hID0gbmV3IEdyb3VwU2NoZW1hKG5vZGUsIHRoaXMpLFxyXG5cdFx0XHQgZ3JvdXAgPSBuZXcgRXhwcmVzc2lvbkdyb3VwKCk7XHJcblxyXG5cdFx0YnVpbGQoc2NoZW1hKTtcclxuXHRcdHNjaGVtYS5hcHBseShncm91cCk7XHJcblx0XHRncm91cC5pZCA9IGlkO1xyXG5cdFx0dGhpcy5leHByZXNzaW9ucy5zcGxpY2UoaW5kZXgsIDEsIGdyb3VwKVxyXG5cdFx0dGhpcy5pbW11dGFibGUgPSBmYWxzZTtcclxuXHR9O1xyXG5cclxuXHR0aGlzLnJlbW92ZSA9IGZ1bmN0aW9uIChpZCkge1xyXG5cdFx0dmFyIGluZGV4ID0gZ2V0SW5kZXgoaWQpO1xyXG5cdFx0dGhpcy5leHByZXNzaW9uc1tpbmRleF0uZXhwcmVzc2lvbnMgPSBbXTtcclxuXHR9O1xyXG59IiwidmFyIE5vZGUgPSByZXF1aXJlKCcuL25vZGUnKSxcclxuICAgIExpbmUgPSByZXF1aXJlKCcuL2xpbmUnKSxcclxuICAgIEV4cHJlc3Npb25Hcm91cCA9IHJlcXVpcmUoJy4uL21vZGVsL2V4cHJlc3Npb24tZ3JvdXAnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKEdyb3VwU2NoZW1hLCB1bmRlZmluZWQpIHtcclxuICAgIGZ1bmN0aW9uIE5vZGVTY2hlbWEobWFwKSB7XHJcbiAgICAgICAgdGhpcy5wbGFuID0gW107XHJcbiAgICAgICAgdGhpcy5wbGFuTWFwID0ge307XHJcbiAgICAgICAgdGhpcy5zY2hlbWFNYXAgPSBtYXAgfHwge307XHJcbiAgICAgICAgdGhpcy5Hcm91cFNjaGVtYSA9IEdyb3VwU2NoZW1hO1xyXG4gICAgfVxyXG5cclxuICAgIE5vZGVTY2hlbWEucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHZhciBzY2hlbWEgPSBuZXcgTm9kZVNjaGVtYSh0aGlzLm1hcCk7XHJcbiAgICAgICAgc2NoZW1hLnBsYW4gPSB0aGlzLnBsYW47XHJcbiAgICAgICAgc2NoZW1hLnBsYW5NYXAgPSB0aGlzLnBsYW5NYXA7XHJcbiAgICAgICAgcmV0dXJuIHNjaGVtYTtcclxuXHJcbiAgICB9O1xyXG5cclxuICAgIE5vZGVTY2hlbWEucHJvdG90eXBlLmF0dHIgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xyXG4gICAgICAgIHZhciBhZGRBdHRyaWJ1dGUgPSBmdW5jdGlvbiAobm9kZSwgbGluZSkge1xyXG4gICAgICAgICAgICBub2RlLmF0dHIoa2V5LCB2YWx1ZSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5wbGFuLnB1c2goYWRkQXR0cmlidXRlKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9O1xyXG5cclxuICAgIE5vZGVTY2hlbWEucHJvdG90eXBlLmFwcGx5ID0gZnVuY3Rpb24gKG5vZGUpIHtcclxuICAgICAgICBub2RlID0gbm9kZSB8fCBuZXcgTm9kZSgnI3Jvb3QnLCB0aGlzKTtcclxuXHJcbiAgICAgICAgdmFyIGxpbmUgPSBuZXcgTGluZShHcm91cFNjaGVtYSk7XHJcbiAgICAgICAgbm9kZS5saW5lID0gbGluZTtcclxuXHJcbiAgICAgICAgdGhpcy5wbGFuLmZvckVhY2goZnVuY3Rpb24gKHApIHtcclxuICAgICAgICAgICAgcChub2RlLCBsaW5lKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5vZGU7XHJcbiAgICB9O1xyXG5cclxuICAgIE5vZGVTY2hlbWEucHJvdG90eXBlLm5vZGUgPSBmdW5jdGlvbiAoaWQsIGJ1aWxkKSB7XHJcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuICAgICAgICBpZiAoIWJ1aWxkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQnVpbGQgZnVuY3Rpb24gaXMgbm90IGRlZmluZWQnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBidWlsZE5vZGUgPSBmdW5jdGlvbiAobm9kZSwgbGluZSkge1xyXG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gbmV3IE5vZGVTY2hlbWEoc2VsZi5zY2hlbWFNYXApO1xyXG4gICAgICAgICAgICBidWlsZChzY2hlbWEpO1xyXG5cclxuICAgICAgICAgICAgdmFyIG5ld05vZGUgPSBuZXcgTm9kZShpZCwgc2NoZW1hLCBub2RlKTtcclxuICAgICAgICAgICAgc2NoZW1hLmFwcGx5KG5ld05vZGUpO1xyXG4gICAgICAgICAgICBub2RlLmFkZENoaWxkQWZ0ZXIobmV3Tm9kZSk7XHJcbiAgICAgICAgICAgIHNlbGYuc2NoZW1hTWFwW2lkXSA9IHNjaGVtYTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBub2RlO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucGxhbi5wdXNoKGJ1aWxkTm9kZSk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfTtcclxuXHJcbiAgICBOb2RlU2NoZW1hLnByb3RvdHlwZS5ncm91cCA9IGZ1bmN0aW9uIChpZCwgYnVpbGQpIHtcclxuICAgICAgICBpZiAoIWJ1aWxkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQnVpbGQgZnVuY3Rpb24gaXMgbm90IGRlZmluZWQnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBidWlsZEdyb3VwID0gZnVuY3Rpb24gKG5vZGUsIGxpbmUpIHtcclxuICAgICAgICAgICAgdmFyIGV4cHJlc3Npb25Hcm91cCA9IG5ldyBFeHByZXNzaW9uR3JvdXAoKTtcclxuICAgICAgICAgICAgZXhwcmVzc2lvbkdyb3VwLmlkID0gaWQ7XHJcblxyXG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gbmV3IEdyb3VwU2NoZW1hKG5vZGUsIGxpbmUpO1xyXG4gICAgICAgICAgICBidWlsZChzY2hlbWEpO1xyXG4gICAgICAgICAgICBzY2hlbWEuYXBwbHkoZXhwcmVzc2lvbkdyb3VwKTtcclxuICAgICAgICAgICAgbGluZS5hZGQoZXhwcmVzc2lvbkdyb3VwKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBub2RlO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucGxhbi5wdXNoKGJ1aWxkR3JvdXApO1xyXG4gICAgICAgIHRoaXMucGxhbk1hcFtpZF0gPSBidWlsZEdyb3VwO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIE5vZGVTY2hlbWE7XHJcbn07IiwidmFyIHV0aWxpdHkgPSByZXF1aXJlKCcuLi9zZXJ2aWNlcy91dGlscycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBOb2RlO1xyXG5cclxuZnVuY3Rpb24gTm9kZShpZCwgc2NoZW1hLCBwYXJlbnQpIHtcclxuICAgIHRoaXMuaWQgPSBpZDtcclxuICAgIHRoaXMuYXR0cmlidXRlcyA9IHt9O1xyXG4gICAgdGhpcy5zY2hlbWEgPSBzY2hlbWE7XHJcbiAgICB0aGlzLnBhcmVudCA9IHBhcmVudDtcclxuICAgIHRoaXMuY2hpbGRyZW4gPSBbXTtcclxuICAgIHRoaXMubGV2ZWwgPSBwYXJlbnQgPyBwYXJlbnQubGV2ZWwgKyAxIDogMDtcclxufVxyXG5cclxuTm9kZS5wcm90b3R5cGUuYXR0ciA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XHJcbiAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHRoaXMuYXR0cmlidXRlc1trZXldID0gdmFsdWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJpYnV0ZXNba2V5XTtcclxuICAgIH1cclxufTtcclxuXHJcbk5vZGUucHJvdG90eXBlLmNsYXNzZXMgPSBmdW5jdGlvbiAoKSB7IFxyXG59O1xyXG5cclxuTm9kZS5wcm90b3R5cGUuYWRkQ2hpbGRBZnRlciA9IGZ1bmN0aW9uIChjaGlsZCwgYWZ0ZXIpIHtcclxuICAgIHZhciBpbmRleCA9IGFmdGVyXHJcbiAgICAgICAgPyB0aGlzLmNoaWxkcmVuLmluZGV4T2YoYWZ0ZXIpXHJcbiAgICAgICAgOiB0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDE7XHJcblxyXG4gICAgdGhpcy5jaGlsZHJlbi5zcGxpY2UoaW5kZXggKyAxLCAwLCBjaGlsZCk7XHJcbiAgICBjaGlsZC5wYXJlbnQgPSB0aGlzO1xyXG4gICAgY2hpbGQubGV2ZWwgPSB0aGlzLmxldmVsICsgMTtcclxufTtcclxuXHJcbk5vZGUucHJvdG90eXBlLmFkZENoaWxkQmVmb3JlID0gZnVuY3Rpb24gKGNoaWxkLCBiZWZvcmUpIHtcclxuICAgIHZhciBpbmRleCA9IGJlZm9yZVxyXG4gICAgICAgID8gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGJlZm9yZSlcclxuICAgICAgICA6IDA7XHJcblxyXG4gICAgdGhpcy5jaGlsZHJlbi5zcGxpY2UoaW5kZXgsIDAsIGNoaWxkKTtcclxuICAgIGNoaWxkLnBhcmVudCA9IHRoaXM7XHJcbiAgICBjaGlsZC5sZXZlbCA9IHRoaXMubGV2ZWwgKyAxO1xyXG59O1xyXG5cclxuTm9kZS5wcm90b3R5cGUuYWRkQWZ0ZXIgPSBmdW5jdGlvbiAoY2hpbGQpIHtcclxuICAgIGlmICghdGhpcy5wYXJlbnQpIHtcclxuICAgICAgICB0aHJvdyBFcnJvcignQ2FuXFwndCBhZGQgYWZ0ZXIgcm9vdCcpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5wYXJlbnQuYWRkQ2hpbGRBZnRlcihjaGlsZCwgdGhpcyk7XHJcbn07XHJcblxyXG5Ob2RlLnByb3RvdHlwZS5hZGRCZWZvcmUgPSBmdW5jdGlvbiAoY2hpbGQpIHtcclxuICAgIGlmICghdGhpcy5wYXJlbnQpIHtcclxuICAgICAgICB0aHJvdyBFcnJvcignQ2FuXFwndCBhZGQgYmVmb3JlIHJvb3QnKTtcclxuICAgIH1cclxuICAgIHRoaXMucGFyZW50LmFkZENoaWxkQmVmb3JlKGNoaWxkLCB0aGlzKTtcclxufTtcclxuXHJcbk5vZGUucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xyXG4gICAgdmFyIG5vZGUgPSBuZXcgTm9kZSh0aGlzLmlkLCB0aGlzLnNjaGVtYSk7XHJcbiAgICByZXR1cm4gdGhpcy5zY2hlbWEuYXBwbHkobm9kZSk7XHJcbn07XHJcblxyXG5Ob2RlLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICBpZiAoIXRoaXMucGFyZW50KSB7XHJcbiAgICAgICAgdGhyb3cgRXJyb3IoJ1Jvb3QgZWxlbWVudCBjYW5cXCd0IGJlIHJlbW92ZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgaW5kZXggPSB0aGlzLnBhcmVudC5jaGlsZHJlbi5pbmRleE9mKHRoaXMpO1xyXG4gICAgdGhpcy5wYXJlbnQuY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAxKTtcclxufTtcclxuXHJcbk5vZGUucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKCkge1xyXG4gICAgdGhpcy5jaGlsZHJlbi5mb3JFYWNoKGZ1bmN0aW9uIChjaGlsZCkge1xyXG4gICAgICAgIGNoaWxkLnBhcmVudCA9IG51bGw7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmNoaWxkcmVuID0gW107XHJcbn07XHJcblxyXG5Ob2RlLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChpZGVudCkge1xyXG4gICAgaWRlbnQgPSBpZGVudCB8fCAwO1xyXG4gICAgcmV0dXJuIEFycmF5KGlkZW50KS5qb2luKCctJykgKyB0aGlzLmV4cHJlc3Npb24uaWQgKyAnICcgKyB0aGlzLmxldmVsICsgJ1xcbicgK1xyXG4gICAgICAgIHRoaXMuY2hpbGRyZW5cclxuICAgICAgICAgICAgLm1hcChmdW5jdGlvbiAoY2hpbGQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjaGlsZC50b1N0cmluZyhpZGVudCArIDEpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuam9pbignXFxuJyk7XHJcbn07XHJcblxyXG5Ob2RlLnByb3RvdHlwZS50b1RyYWNlU3RyaW5nID0gZnVuY3Rpb24gKGlkZW50KSB7XHJcbiAgICBpZiAobnVsbCAhPSB0aGlzLnBhcmVudCkge1xyXG4gICAgICAgIHZhciBwYXJlbnQgPSB0aGlzLnBhcmVudDtcclxuICAgICAgICB3aGlsZSAobnVsbCAhPT0gcGFyZW50LnBhcmVudCkge1xyXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50LnRvU3RyaW5nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKTtcclxufTsiLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCcuLi9zZXJ2aWNlcy91dGlscycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYW5ndWxhcikge1xyXG4gICAgYW5ndWxhci5tb2R1bGUoJ2V4cHJlc3Npb24tYnVpbGRlcicpLmRpcmVjdGl2ZSgnZWJDbGFzcycsIERpcmVjdGl2ZSk7XHJcblxyXG4gICAgRGlyZWN0aXZlLiRpbmplY3QgPSBbJyRwYXJzZSddO1xyXG5cclxuICAgIGZ1bmN0aW9uIERpcmVjdGl2ZSgkcGFyc2UpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICByZXN0cmljdDogJ0EnLFxyXG4gICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIpIHtcclxuICAgICAgICAgICAgICAgIHZhciBnZXR0ZXIgPSAkcGFyc2UoYXR0ci5lYkNsYXNzKSxcclxuICAgICAgICAgICAgICAgICAgICBjbGFzc2VzID0gJyc7XHJcblxyXG4gICAgICAgICAgICAgICAgdmFyIHVuYmluZCA9IHNjb3BlLiR3YXRjaChldmFsdWF0ZUNsYXNzT2JqZWN0LCBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZih2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgb2xkQ2xhc3NlcyA9IGNsYXNzZXM7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXdDbGFzc2VzID0gZmV0Y2hDbGFzc2VzKHZhbHVlKS5qb2luKCcgJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvbGRDbGFzc2VzICE9PSBuZXdDbGFzc2VzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc2VzID0gbmV3Q2xhc3NlcztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2xhc3Mob2xkQ2xhc3Nlcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmFkZENsYXNzKGNsYXNzZXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2V7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2xhc3MoY2xhc3Nlcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzZXMgPSAnJztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LCB0cnVlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBldmFsdWF0ZUNsYXNzT2JqZWN0KCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBjbGFzc09iamVjdCA9IGdldHRlcihzY29wZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghY2xhc3NPYmplY3QpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGNsYXNzT2JqZWN0KSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0ge30sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBrZXkgPSBrZXlzW2ldLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBjbGFzc09iamVjdFtrZXldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodXRpbHMuaXNGdW5jdGlvbih2YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdFtrZXldID0gdmFsdWUoc2NvcGUubm9kZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRba2V5XSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGZldGNoQ2xhc3NlcyhvYmplY3QpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc2VzID0gW107XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvYmplY3Rba2V5XSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKGtleSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjbGFzc2VzO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdW5iaW5kKCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYW5ndWxhcikge1xyXG5cclxuICAgIGFuZ3VsYXIubW9kdWxlKCdleHByZXNzaW9uLWJ1aWxkZXInKS5kaXJlY3RpdmUoJ2ViRXhwcmVzc2lvbicsIERpcmVjdGl2ZSk7XHJcblxyXG4gICAgRGlyZWN0aXZlLiRpbmplY3QgPSBbJyR0ZW1wbGF0ZUNhY2hlJywgJyRjb21waWxlJ107XHJcblxyXG4gICAgZnVuY3Rpb24gRGlyZWN0aXZlKCR0ZW1wbGF0ZUNhY2hlLCAkY29tcGlsZSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHJlc3RyaWN0OiAnQScsXHJcbiAgICAgICAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgICAgICAgICBleHByZXNzaW9uOiAnPWViRXhwcmVzc2lvbidcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgdGVtcGxhdGUgPSAkdGVtcGxhdGVDYWNoZS5nZXQoc2NvcGUuZXhwcmVzc2lvbi50ZW1wbGF0ZSk7XHJcbiAgICAgICAgICAgICAgICB2YXIgZXhwcmVzc2lvbiA9ICRjb21waWxlKHRlbXBsYXRlKShzY29wZSk7XHJcbiAgICAgICAgICAgICAgICBlbGVtZW50LmFwcGVuZChleHByZXNzaW9uKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhbmd1bGFyKSB7XHJcbiAgICBhbmd1bGFyLm1vZHVsZSgnZXhwcmVzc2lvbi1idWlsZGVyJykuZGlyZWN0aXZlKCdlYk5vZGUnLCBEaXJlY3RpdmUpO1xyXG5cclxuICAgIERpcmVjdGl2ZS4kaW5qZWN0ID0gW107XHJcblxyXG4gICAgZnVuY3Rpb24gRGlyZWN0aXZlKCkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHJlc3RyaWN0OiAnQScsXHJcbiAgICAgICAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgICAgICAgICBub2RlOiAnPWViTm9kZSdcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgdGVtcGxhdGVVcmw6ICdlYi1ub2RlLmh0bWwnLFxyXG4gICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIpIHtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCJtb2R1bGUuZXhwb3J0cyA9IEdyb3VwO1xyXG5cclxuZnVuY3Rpb24gR3JvdXAoKSB7XHJcbiAgICB0aGlzLmV4cHJlc3Npb25zID0gW107XHJcbiAgICB0aGlzLnRlbXBsYXRlID0gJ2ViLWdyb3VwLmh0bWwnO1xyXG59XHJcbiIsInZhciB1dGlsaXR5ID0gcmVxdWlyZSgnLi91dGlscycpLFxyXG4gICAgTm9kZSA9IHJlcXVpcmUoJy4uL2J1aWxkZXIvbm9kZScpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBEZXNlcmlhbGl6YXRpb25TZXJ2aWNlO1xyXG5cclxuZnVuY3Rpb24gdHJhdmVyc2Uobm9kZSwgbWFwKSB7XHJcbiAgICBpZiAoIW1hcC5oYXNPd25Qcm9wZXJ0eShub2RlLmlkKSkge1xyXG4gICAgICAgIG1hcFtub2RlLmlkXSA9IG5vZGU7XHJcbiAgICB9XHJcblxyXG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG5vZGUuY2hpbGRyZW4ubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgY2hpbGQgPSBub2RlLmNoaWxkcmVuWzBdXHJcbiAgICAgICAgdHJhdmVyc2UoY2hpbGQsIG1hcCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIERlc2VyaWFsaXphdGlvblNlcnZpY2Uoc2NoZW1hKSB7XHJcbiAgICBmdW5jdGlvbiBkZXNlcmlhbGl6ZShkYXRhLCBwYXJlbnQsIG5vZGVNYXApIHtcclxuICAgICAgICBub2RlTWFwID0gbm9kZU1hcCB8fCB7fTtcclxuXHJcbiAgICAgICAgaWYgKCFwYXJlbnQpIHtcclxuICAgICAgICAgICAgdmFyIG5vZGUgPSBuZXcgTm9kZShkYXRhLmlkLCBzY2hlbWEpO1xyXG4gICAgICAgICAgICBzY2hlbWEuYXBwbHkobm9kZSk7XHJcbiAgICAgICAgICAgIHRyYXZlcnNlKG5vZGUsIG5vZGVNYXApO1xyXG4gICAgICAgICAgICBub2RlLmNsZWFyKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdmFyIG5vZGUgPSBub2RlTWFwW2RhdGEuaWRdO1xyXG4gICAgICAgICAgICBub2RlID0gbm9kZS5jbG9uZSgpO1xyXG4gICAgICAgICAgICBwYXJlbnQuYWRkQ2hpbGRBZnRlcihub2RlKTtcclxuICAgICAgICAgICAgdHJhdmVyc2UocGFyZW50LCBub2RlTWFwKTtcclxuICAgICAgICAgICAgbm9kZS5jbGVhcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdXRpbGl0eS5vdmVycmlkZShub2RlLmF0dHJpYnV0ZXMsIGRhdGEuYXR0cmlidXRlcyk7XHJcblxyXG4gICAgICAgIGRlc2VyaWFsaXplTGluZShub2RlLCBub2RlLmxpbmUsIGRhdGEubGluZSk7XHJcblxyXG4gICAgICAgIHZhciBjaGlsZHJlbiA9IGRhdGEuY2hpbGRyZW4sXHJcbiAgICAgICAgICAgIGxlbmd0aCA9IGNoaWxkcmVuLmxlbmd0aDtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB2YXIgY2hpbGQgPSBjaGlsZHJlbltpXTtcclxuICAgICAgICAgICAgbmV3IERlc2VyaWFsaXphdGlvblNlcnZpY2Uoc2NoZW1hLnNjaGVtYU1hcFtjaGlsZC5pZF0pLmRlc2VyaWFsaXplKGNoaWxkLCBub2RlLCBub2RlTWFwKTtcclxuXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gbm9kZTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkZXNlcmlhbGl6ZUxpbmUobm9kZSwgbGluZSwgZGF0YUxpbmUpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZGF0YUxpbmUubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIHNlcmlhbGl6ZWRHcm91cCA9IGRhdGFMaW5lW2ldO1xyXG5cclxuICAgICAgICAgICAgZGVzZXJpYWxpemVHcm91cChub2RlLCBsaW5lLCBsaW5lLmdldChzZXJpYWxpemVkR3JvdXAuaWQpLCBzZXJpYWxpemVkR3JvdXApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkZXNlcmlhbGl6ZUdyb3VwKG5vZGUsIGxpbmUsIGdyb3VwLCBkYXRhR3JvdXApIHtcclxuICAgICAgICB2YXIgc2VyaWFsaXplZEV4cHJlc3Npb25zID0gZGF0YUdyb3VwLmV4cHJlc3Npb25zLFxyXG4gICAgICAgICAgICBsZW5ndGggPSBzZXJpYWxpemVkRXhwcmVzc2lvbnMubGVuZ3RoO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBzZXJpYWxpemVkRXhwID0gc2VyaWFsaXplZEV4cHJlc3Npb25zW2ldO1xyXG5cclxuICAgICAgICAgICAgdmFyIGluZGV4ID0gdXRpbGl0eS5pbmRleE9mKGdyb3VwLmV4cHJlc3Npb25zLCBmdW5jdGlvbiAoZXhwcmVzc2lvbikge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4cHJlc3Npb24uaWQgPT09IHNlcmlhbGl6ZWRFeHAuaWQ7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdXRpbGl0eS5vdmVycmlkZShncm91cC5leHByZXNzaW9uc1tpbmRleF0sIHNlcmlhbGl6ZWRFeHApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoc2VyaWFsaXplZEV4cHJlc3Npb25zW2ldLm1ldGhvZCkge1xyXG4gICAgICAgICAgICAgICAgc2VyaWFsaXplZEV4cHJlc3Npb25zW2ldLm1ldGhvZC5mb3JFYWNoKGZ1bmN0aW9uIChtKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXAuZXhwcmVzc2lvbnNbaW5kZXhdW21dKG5vZGUsIGxpbmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGdyb3VwLmV4cHJlc3Npb25zW2luZGV4XS5tZXRob2QgPSBzZXJpYWxpemVkRXhwcmVzc2lvbnNbaV0ubWV0aG9kO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5kZXNlcmlhbGl6ZSA9IGRlc2VyaWFsaXplO1xyXG59XHJcbiIsInZhciB1dGlsaXR5ID0gcmVxdWlyZSgnLi91dGlscycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgICBtZXRob2Q6IG1ldGhvZCxcclxuICAgIG1ldGhvZHNPZjogbWV0aG9kc09mXHJcbn07XHJcblxyXG5mdW5jdGlvbiBtZXRob2Qob2JqZWN0LCBrZXkpIHtcclxuICAgIHZhciBzb3VyY2VGdW5jdGlvbiA9IG9iamVjdFtrZXldO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgd2l0aDogd2l0aEZhY3Rvcnkob2JqZWN0LCBrZXksIHNvdXJjZUZ1bmN0aW9uKVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBtZXRob2RzT2Yob2JqKSB7XHJcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iaiksXHJcbiAgICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXHJcbiAgICAgICAgcGF0Y2ggPSB7fTtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcblxyXG4gICAgICAgIGlmICh1dGlsaXR5LmlzRnVuY3Rpb24ob2JqW2tleV0pKSB7XHJcbiAgICAgICAgICAgIHBhdGNoW2tleV0gPSBtZXRob2Qob2JqLCBrZXkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHdpdGg6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhwYXRjaCksXHJcbiAgICAgICAgICAgICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcclxuICAgICAgICAgICAgICAgIGFyZ3MgPSB1dGlsaXR5LmFzQXJyYXkoYXJndW1lbnRzKTtcclxuXHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xyXG4gICAgICAgICAgICAgICAgb2JqLmFjdGlvbiA9IGtleTtcclxuICAgICAgICAgICAgICAgIHBhdGNoW2tleV0ud2l0aC5hcHBseShvYmosIGFyZ3MpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB3aXRoRmFjdG9yeShvYmplY3QsIGtleSwgc291cmNlRnVuY3Rpb24pIHtcclxuICAgIHZhciB3aXRoRnVuY3Rpb24gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgdmFyIGFyZ3MgPSB1dGlsaXR5LmFzQXJyYXkoYXJndW1lbnRzKTtcclxuXHJcbiAgICAgICAgb2JqZWN0W2tleV0gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBzb3VyY2VGdW5jdGlvbi5hcHBseShvYmplY3QsIGFyZ3MpO1xyXG4gICAgICAgIH07XHJcbiAgICB9O1xyXG5cclxuICAgIHdpdGhGdW5jdGlvbi5kZWNvcmF0b3IgPSBmdW5jdGlvbiAoZGVjb3JhdGUpIHtcclxuICAgICAgICB2YXIgYXJncyA9IHV0aWxpdHkuYXNBcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xyXG5cclxuICAgICAgICBvYmplY3Rba2V5XSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGRlY29yYXRlLmFwcGx5KG9iamVjdCwgW3NvdXJjZUZ1bmN0aW9uLCBvYmplY3QsIGtleV0uY29uY2F0KGFyZ3MpKTtcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gd2l0aEZ1bmN0aW9uO1xyXG59XHJcbiIsInZhciB1dGlsaXR5ID0gcmVxdWlyZSgnLi91dGlscycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTZXJpYWxpemF0aW9uU2VydmljZTtcclxuXHJcbmZ1bmN0aW9uIFNlcmlhbGl6YXRpb25TZXJ2aWNlKG5vZGUpIHtcclxuICAgIGZ1bmN0aW9uIHNlcmlhbGl6ZSgpIHtcclxuICAgICAgICB2YXIgZ3JvdXBzID0gbm9kZS5saW5lLmV4cHJlc3Npb25zLm1hcChzZXJpYWxpemVHcm91cCk7XHJcbiAgICAgICAgdmFyIGF0dHJzID0gdXRpbGl0eS5jbG9uZShub2RlLmF0dHJpYnV0ZXMpO1xyXG4gICAgICAgIGRlbGV0ZSBhdHRycy5zZXJpYWxpemU7XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGlkOiBub2RlLmlkLFxyXG4gICAgICAgICAgICBhdHRyaWJ1dGVzOiBhdHRycyxcclxuICAgICAgICAgICAgY2hpbGRyZW46IG5vZGUuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uIChjaGlsZCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBTZXJpYWxpemF0aW9uU2VydmljZShjaGlsZCkuc2VyaWFsaXplKCk7XHJcbiAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICBsaW5lOiBncm91cHMuZmlsdGVyKGZ1bmN0aW9uIChncm91cCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGdyb3VwLmV4cHJlc3Npb25zLmxlbmd0aDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc2VyaWFsaXplR3JvdXAoZ3JvdXApIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBpZDogZ3JvdXAuaWQsXHJcbiAgICAgICAgICAgIGV4cHJlc3Npb25zOiBncm91cC5leHByZXNzaW9uc1xyXG4gICAgICAgICAgICAgICAgLmZpbHRlcihzZXJpYWxpemFibGUpXHJcbiAgICAgICAgICAgICAgICAubWFwKHNlcmlhbGl6ZUV4cHJlc3Npb24pXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHNlcmlhbGl6YWJsZShleHByZXNzaW9uKSB7XHJcbiAgICAgICAgdmFyIHNlcmlhbGl6ZUF0dHIgPSBub2RlLmF0dHIoJ3NlcmlhbGl6ZScpO1xyXG4gICAgICAgIGlmICghc2VyaWFsaXplQXR0cikge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgcHJvcGVydGllc1RvU2VyaWFsaXplID0gc2VyaWFsaXplQXR0cltleHByZXNzaW9uLmlkXTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHByb3BlcnRpZXNUb1NlcmlhbGl6ZSAmJiBwcm9wZXJ0aWVzVG9TZXJpYWxpemUubGVuZ3RoO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHNlcmlhbGl6ZUV4cHJlc3Npb24oZXhwcmVzc2lvbikge1xyXG4gICAgICAgIHZhciBzZXJpYWxpemVBdHRyID0gbm9kZS5hdHRyKCdzZXJpYWxpemUnKTtcclxuXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHt9LFxyXG4gICAgICAgICAgICBwcm9wZXJ0aWVzVG9TZXJpYWxpemUgPSBzZXJpYWxpemVBdHRyW2V4cHJlc3Npb24uaWRdO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gcHJvcGVydGllc1RvU2VyaWFsaXplLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBwcm9wID0gcHJvcGVydGllc1RvU2VyaWFsaXplW2ldO1xyXG4gICAgICAgICAgICByZXN1bHRbcHJvcF0gPSBleHByZXNzaW9uW3Byb3BdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXN1bHQuaWQgPSBleHByZXNzaW9uLmlkO1xyXG4gICAgICAgIHJlc3VsdC50eXBlID0gZXhwcmVzc2lvbi50eXBlO1xyXG4gICAgICAgIHJlc3VsdC5tZXRob2QgPSBleHByZXNzaW9uLm1ldGhvZDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnNlcmlhbGl6ZSA9IHNlcmlhbGl6ZTtcclxufVxyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IFRyYXZlcnNlU2VydmljZTtcclxuXHJcbmZ1bmN0aW9uIFRyYXZlcnNlU2VydmljZSgpIHtcclxuICAgIGZ1bmN0aW9uIHZpc2l0TGluZShyZWR1Y2UsIG1lbW8sIG5vZGUsIGxpbmUpIHtcclxuICAgICAgICB2YXIgZ3JvdXBzID0gbGluZS5leHByZXNzaW9ucyxcclxuICAgICAgICAgICAgbGVuZ3RoID0gZ3JvdXBzLmxlbmd0aDtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBtZW1vID0gdmlzaXRHcm91cChyZWR1Y2UsIG1lbW8sIG5vZGUsIGxpbmUsIGdyb3Vwc1tpXSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gbWVtbztcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiB2aXNpdEdyb3VwKHJlZHVjZSwgbWVtbywgbm9kZSwgbGluZSwgZ3JvdXApIHtcclxuICAgICAgICB2YXIgZXhwcmVzc2lvbnMgPSBncm91cC5leHByZXNzaW9ucyxcclxuICAgICAgICAgICAgbGVuZ3RoID0gZXhwcmVzc2lvbnMubGVuZ3RoO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIG1lbW8gPSByZWR1Y2UobWVtbywgZXhwcmVzc2lvbnNbaV0sIGxpbmUsIG5vZGUpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIG1lbW87XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5kZXB0aCA9IGZ1bmN0aW9uIChyb290KSB7XHJcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKHJlZHVjZSwgbWVtbykge1xyXG4gICAgICAgICAgICBtZW1vID0gdmlzaXRMaW5lKHJlZHVjZSwgbWVtbywgcm9vdCwgcm9vdC5saW5lKTtcclxuXHJcbiAgICAgICAgICAgIHZhciBjaGlsZHJlbiA9IHJvb3QuY2hpbGRyZW4sXHJcbiAgICAgICAgICAgICAgICBsZW5ndGggPSBjaGlsZHJlbi5sZW5ndGg7XHJcblxyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICBtZW1vID0gc2VsZi5kZXB0aChjaGlsZHJlbltpXSkocmVkdWNlLCBtZW1vKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIG1lbW87XHJcbiAgICAgICAgfTtcclxuICAgIH07XHJcblxyXG59XHJcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgYXNBcnJheTogYXNBcnJheSxcclxuICAgIGNsb25lOiBjbG9uZSxcclxuICAgIGRlZmF1bHRzOiBkZWZhdWx0cyxcclxuICAgIGluZGV4T2Y6IGluZGV4T2YsXHJcbiAgICBpc0FycmF5OiBBcnJheS5pc0FycmF5LFxyXG4gICAgaXNGdW5jdGlvbjogaXNGdW5jdGlvbixcclxuICAgIGlzT2JqZWN0OiBpc09iamVjdCxcclxuICAgIG92ZXJyaWRlOiBvdmVycmlkZVxyXG59O1xyXG5cclxuZnVuY3Rpb24gaW5kZXhPZihhcnJheSwgcHJlZGljYXRlKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAocHJlZGljYXRlKGFycmF5W2ldLCBpKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gaTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gLTE7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFzQXJyYXkoYXJncykge1xyXG4gICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3MpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjbG9uZShvYmplY3QpIHtcclxuICAgIHZhciByZXN1bHQgPSB7fSxcclxuICAgICAgICBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcclxuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgcmVzdWx0W2tleV0gPSBvYmplY3Rba2V5XVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlZmF1bHRzKGRzdCkge1xyXG4gICAgdmFyIHNvdXJjZXNMZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoO1xyXG4gICAgdmFyIGFyZ3MgPSBhc0FycmF5KGFyZ3VtZW50cyk7XHJcbiAgICB2YXIgcmVzdWx0ID0gY2xvbmUoZHN0KTtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IHNvdXJjZXNMZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBzb3VyY2UgPSBhcmdzW2ldO1xyXG5cclxuICAgICAgICBpZiAoIXNvdXJjZSkge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoc291cmNlKTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgayA9IDAsIGtleXNMZW5ndGggPSBrZXlzLmxlbmd0aDsgayA8IGtleXNMZW5ndGg7IGsrKykge1xyXG4gICAgICAgICAgICB2YXIga2V5ID0ga2V5c1trXTtcclxuICAgICAgICAgICAgaWYgKCFyZXN1bHQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0W2tleV0gPSBzb3VyY2Vba2V5XTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKHZhbHVlKSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xyXG4gICAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG92ZXJyaWRlKGRzdCwgc3JjKSB7XHJcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHNyYyksXHJcbiAgICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XHJcblxyXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgZHN0W2tleV0gPSBzcmNba2V5XTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZHN0O1xyXG59XHJcbiJdfQ==

angular.module("expression-builder").run(["$templateCache", function($templateCache) {$templateCache.put("eb-group.html","<ul class=\"expression-builder-group\">\r\n    <li ng-repeat=\"exp in expression.expressions\"\r\n        eb-expression=\"exp\"\r\n        class=\"expression-builder-expression\">\r\n    </li>\r\n</ul>");
$templateCache.put("eb-node.html","<ul class=\"expression-builder-node\" eb-class=\"node.attr(\'class\')\">\r\n    <li ng-repeat=\"expression in node.line.expressions\"\r\n        eb-expression=\"expression\"\r\n        class=\"expression-builder-expression\">\r\n    </li>\r\n\r\n    <li ng-repeat=\"child in node.children\" eb-node=\"child\" class=\"expression-builder-child\">\r\n    </li>\r\n</ul>");}]);