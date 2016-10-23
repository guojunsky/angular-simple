var Utils = {
  equals: function (a, b) {
    'use strict';
    return JSON.stringify(a) === JSON.stringify(b);
  },
  clone: function (a) {
    'use strict';
    try {
      return JSON.parse(JSON.stringify(a));
    } catch (e) {
      return undefined;
    }
  }
};


/**
 * provider 核心逻辑
 * @type {Object}
 */
var Provider= {
	_providers:{},
	directive:function (name,fn) {
	   this._register(name + Provider.DIRECTIVES_SUFFIX,fn);
	},
	controller:function (name,fn) {
		this._register(name + Provider.CONTROLLER_SUFFIX,function () {
			return fn; 
		});
	},
	service:function (name,fn) {
		this._register(name,fn);
	},
	_register:function (name,factory) {
		 this._providers[name] = factory;
	},
	get:function (name,locals) {
		 if(this._cache[name]){
		 	return this._cache[name];
		 }
		 var provider =  this._providers[name];
		 if(!provider || typeof provider !== 'function'){
		 	 return null;
		 }

		 return (this._cache[name] = this.invoke(provider,locals));
	},
	annotate:function (fn) {
		var res = fn.toString()
		 .replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg, '')
         .match(/\((.*?)\)/);
         if(res && res[1]){
         	return res[1].split(',').map(function (d) {
         		 return d.trim();
         	});
         }
         return [];
	},
	invoke:function (fn,locals) {
		locals = locals || {};
		var deps = this.annotate(fn).map(function (s) {
			 return locals[s] || this.get(s,locals);
		},this);
		return fn.apply(null,deps);

	},
    _cache:{
    	$rootScope: new Scope()
    }

}

Provider.DIRECTIVES_SUFFIX = 'Directive';
Provider.CONTROLLER_SUFFIX = 'Controller';



//Dom Complie 
//模板编译
var DOMCompile = {
    bootstrap:function () {
    	  this.compile(document.children[0],
           Provider.get('$rootScope'));
    },
    compile:function (el,scope) {
    	var dirs = this._getElDirectives(el);
    	var dir;
    	var  scopeCreated;
        dirs.forEach(function (d) {
        	 dir = Provider.get(d.name + Provider.DIRECTIVES_SUFFIX);
        	 if(dir.scope && !scopeCreated){
        	 	 scope = scope.$new();
        	 	 scopeCreated = true;
        	 }

        	 dir.link(el,scope,d.value);
        });

        Array.prototype.slice.call(el.children).forEach(function (c) {
        	 this.compile(c,scope);
        },this)	 
    },
    _getElDirectives:function (el) {
    	var attrs = el.attributes;
    	var results = [];
    	for(var i=0;i<attrs.length; i++){
            if(Provider.get(attrs[i].name + Provider.DIRECTIVES_SUFFIX)){
            	results.push({
                    name:attrs[i].name,
                    value:attrs[i].value
            	});
            }
    	}
    	return results;
    }
};


/**
 * 双向绑定
 * @param {[type]} parent [description]
 * @param {[type]} id     [description]
 */
function Scope(parent,id) {
	this.$$watchers = [];
	this.$$children = [];
	this.$parent = parent;
	this.$id = id || 0;
}

Scope.counter = 0;




Scope.prototype.$watch = function (exp,fn) {
	this.$$watchers.push({
		exp:exp,
		fn:fn,
		last:Utils.clone(this.$eval(exp))
	});
};

Scope.prototype.$new = function () {
	Scope.counter ++;
	var obj = new Scope(this,Scope.counter);
	Object.setPrototypeOf(obj,this);
	this.$$children.push(obj);
	return obj;
}

Scope.prototype.$destroy = function () {
	 var pc = this.$parent.$$children;
	 pc.splice(pc.indexOf(this),1);
}

Scope.prototype.$digest = function () {
	 var dirty,watcher,current,i;
	 do{

       dirty = false;
       for(i=0;i<this.$$watchers.length;i++){
       	  watcher  = this.$$watchers[i];
       	  current = this.$eval(watcher.exp);
       	  if(!Utils.equals(watcher.last,current)){
       	  	watcher.last = Utils.clone(current);
       	  	dirty = true;
       	  	watcher.fn(current);
       	  }
       }
	 }while(dirty);

	 for(i=0;i<this.$$children.length;i++){
	 	 this.$$children[i].$digest();
	 }
}

Scope.prototype.$eval = function (exp) {
	var val;
	if(typeof exp ==='function'){
		val = exp.call(this);
	}else{
		try{
			with(this){
			val = eval(exp);
		   }
		}catch(e){
			val = undefined;
		}
		
	}
	return val;
}

/***内置一些指令**/
Provider.directive('ng-bind',function () {
	return {
		scope:false,
		link:function(el,scope,exp){
			el.innerHTML = scope.$eval(exp);
			scope.$watch(exp,function (val) {
				el.innerHTML = val;
			});
		}
	}
});


Provider.directive('ng-click',function () {
	return {
		scope:false,
		link:function (el,scope,exp) {
			 el.onclick = function () {
			 	scope.$eval(exp);
			 	scope.$digest();
			 }
		}
	}
});

Provider.directive('ng-controller',function () {
	return {
		scope:true,
		link:function (el,scope,exp) {
	       var ctrl = Provider.get(exp + Provider.CONTROLLER_SUFFIX);
	       Provider.invoke(ctrl,{$scope:scope});
		}
	}
});

Provider.directive('ng-model',function () {
	 return {
         link:function (el,scope,exp) {
         	 el.onkeyup = function () {
         	   scope[exp] = el.val;
         	   scope.$digest();
         	 };

         	 scope.$watch(exp,function (val) {
         	 	 el.value = val;
         	 });
         }
	 }
});

Provider.directive('ng-repeat',function () {
	return {
		scope:false,
		link:function (el,scope,exp) {
			var scope = [];
			var parts = exp.split('in');
			var collectionName = parts[1].trim();
			var item = parts[0].trim();
			var parentNode = el.parentNode;

			function render() {
			 	var els = val;
			 	var currentNode ;
			 	var s;
			 	while(parentNode.firstChild){
			 		parentNode.removeChild(parentNode.firstChild);
			 	}
			 	scopes.forEach(function (s) {
			 		s.$destroy();
			 	});
			 	scopes = [];
			 	els.forEach(function (val) {
			 		 currentNode = el.cloneNode();
			 		 currentNode.removeAttribute('ng-repeat');
			 		 currentNode.removeAttribute('ng-scope');
			 		 s = scope.$new();
			 		 scopes.push(s);
			 		 s[itemName] = val;
			 		 DOMCompile.compile(currentNode,s);
			 		 parentNode.appendNode(currentNode);
			 	});
			 } 



			 scope.$watch(collectionName,render);
			 render(scope.$eval(collectionName));
		}
	};
});















