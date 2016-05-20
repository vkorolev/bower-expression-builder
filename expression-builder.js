(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (angular, undefined) {

   var module = angular.module('expression-builder', []);

   require('./builder/expression-builder')(angular);
   require('./model/eb-expression')(angular);
   require('./model/eb-node')(angular);

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
},{"./builder/expression-builder":2,"./model/eb-expression":7,"./model/eb-node":8,"./services/deserialization":10,"./services/serialization":12}],2:[function(require,module,exports){
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
},{"../model/expression-group":9,"../services/patch":11,"../services/utils":13,"./group-schema":3,"./node-schema":5}],3:[function(require,module,exports){
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
},{"../model/expression-group":9,"../services/utils":13}],5:[function(require,module,exports){
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
},{"../model/expression-group":9,"./line":4,"./node":6}],6:[function(require,module,exports){
var SerializationService = require('../services/serialization');

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


Node.prototype.serialize = function () {
    return new SerializationService(this).serialize(this);
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
},{"../services/serialization":12}],7:[function(require,module,exports){
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
},{}],8:[function(require,module,exports){
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
},{}],9:[function(require,module,exports){
module.exports = Group;

function Group() {
    this.expressions = [];
    this.template = 'eb-group.html';
}

},{}],10:[function(require,module,exports){
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

},{"../builder/node":6,"./utils":13}],11:[function(require,module,exports){
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

},{"./utils":13}],12:[function(require,module,exports){
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

},{"./utils":13}],13:[function(require,module,exports){
module.exports = {
    asArray: asArray,
    clone: clone,
    defaults: defaults,
    indexOf: indexOf,
    isFunction: isFunction,
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

function override(dst, src) {
    var keys = Object.keys(src),
        length = keys.length;

    for(var i = 0; i < length; i++) {
        var key = keys[i];
        dst[key] = src[key];
    }

    return dst;
}

},{}]},{},[1]);

angular.module("expression-builder").run(["$templateCache", function($templateCache) {$templateCache.put("eb-group.html","<ul class=\"expression-builder-group\">\r\n    <li ng-repeat=\"exp in expression.expressions\"\r\n        eb-expression=\"exp\"\r\n        class=\"expression-builder-expression\">\r\n    </li>\r\n</ul>");
$templateCache.put("eb-node.html","<ul class=\"expression-builder-node\" ng-class=\"{ placeholder: node.placeholder }\">\r\n    <li ng-repeat=\"expression in node.line.expressions\"\r\n        eb-expression=\"expression\"\r\n        class=\"expression-builder-expression\">\r\n    </li>\r\n\r\n    <li ng-repeat=\"child in node.children\" eb-node=\"child\" class=\"expression-builder-child\">\r\n    </li>\r\n</ul>");}]);