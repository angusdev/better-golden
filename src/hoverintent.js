(function() {

function registerNS(ns) {
  var nsParts = ns.split('.');
  var root = window;

  for (var i=0; i<nsParts.length; i++) {
    if (typeof root[nsParts[i]] === 'undefined') {
      root[nsParts[i]] = {};
    }
    root = root[nsParts[i]];
  }
}

registerNS("org.ellab.utils");

org.ellab.utils.HoverIntent = function(ele, params) {
  this.lastx = -1;
  this.lasxy = -1;
  this.lastMouseStay = -1;
  // 0 = unstable
  // 10 = wait
  // 20 = done
  this.status = 0;
  this.intervalID = null;
  this.inFocus = document.hasFocus();

  this.reset = function() {
    this.lastx = -1;
    this.lasxy = -1;
    this.lastMouseStay = -1;
    this.status = 0;
  };

  this._constructor = function(ele, params) {
    if (ele === null) {
      return;
    }

    var instance = this;

    this.p = {
      steadyTime: 300,
      actionTime: 1000,
      checkTime: 20
    };
    for (var k in params) {
      this.p[k] = params[k];
    }

    function handleOut() {
      if (instance.status >= 20) {
        return;
      }
      instance.reset();
      if (instance.status >= 10 && instance.p.cancel) {
        instance.p.cancel.call(ele);
      }
    }

    window.addEventListener('mousemove', function(e) {
      if (instance.status >= 20) {
        return;
      }
      if (instance.status >= 10 && instance.p.cancel) {
        instance.p.cancel.call(ele);
      }
      instance.status = 0;
    }, false);

    ele.addEventListener('mousemove', function(e) {
      if (!instance.inFocus) {
        return;
      }
      if (instance.status >= 20) {
        return;
      }
      if (e.clientX !== instance.lastx || e.clientY !== instance.lasty) {
        instance.lastMouseStay = new Date().getTime();
        instance.lastx = e.clientX;
        instance.lasty = e.clientY;
        if (instance.status >= 10 && instance.p.cancel) {
          instance.p.cancel.call(ele);
        }
        instance.status = 0;
      }
    }, false);

    ele.addEventListener('mouseout', handleOut, false);

    try {
      window.top.addEventListener('blur', function() {
        instance.inFocus = false;
        handleOut();
      }, false);

      window.top.addEventListener('focus', function() {
        instance.inFocus = true;
      }, false);
    }
    catch (err) {
      if (window.console && window.console.log) {
        instance.inFocus = true;
        if (instance.inFocus) {
          window.console.log("[HoverIntent] cannot set focus listener, cannot disable HoverIntent event if lost focus");
        }
      }
    }

    this.intervalID = window.setInterval(function() {
      if (instance.status >= 20) {
        return;
      }
      if (instance.lastMouseStay > 0) {
        var diff = new Date().getTime() - instance.lastMouseStay;
        if (diff - instance.p.steadyTime >= instance.p.actionTime) {
          instance.status = 20;
          //if (instance.intervalID) {
          //  window.clearInterval(instance.intervalID);
          //}
          if (instance.p.done) {
            instance.p.done.call(ele, {x: instance.lastx, y: instance.lasty});
          }
          instance.reset();
        }
        else if (diff >= instance.p.steadyTime) {
          diff = diff - instance.p.steadyTime;

          if (instance.status === 0) {
            instance.status = 10;
            if (instance.p.in) {
              instance.p.in.call(ele, {x: instance.lastx, y: instance.lasty, wait: diff, pct: Math.min(diff * 100  / instance.p.actionTime, 100) });
            }
          }
          else if (instance.status === 10) {
            if (instance.p.wait) {
              instance.p.wait.call(ele, {x: instance.lastx, y: instance.lasty, wait: diff, pct: Math.min(diff * 100 / instance.p.actionTime, 100) });
            }
          }
        }
      }
    }, this.p.checkTime);
  }

  this._constructor(ele, params);
}

org.ellab.utils.ProgressHoverIntent = function(ele, params) {
  this.savedIn = null;
  this.savedCancel = null;
  this.savedWait = null;
  this.savedDone = null;

  function getProgressBar(ele) {
    var bar = ele.getElementsByClassName('hover-progress');
    return bar.length>0?bar[0]:null;
  }
  function removeProgressBar(ele) {
    var bar = getProgressBar(ele);
    if (bar && bar.parentNode) {
      bar.parentNode.removeChild(bar);
    }
  }

  this._constructor = function(ele, params) {
    var instance = this;
    this.parent = null;

    params = params || {};
    this.savedIn = params.in;
    this.savedCancel = params.cancel;
    this.savedWait = params.wait;
    this.savedDone = params.done;
    this.p = {
      left: null,
      right: null,
      leftOffset: -30,
      top: null,
      topOffset: -30
    };
    for (var k in params) {
      this.p[k] = params[k];
    }

    params.in = function(e) {
      removeProgressBar(this);
      var bar = document.createElement('div');
      bar.innerHTML = '<div style="width:' + e.pct + '%"></div>';
      bar.className = 'hover-progress' + (params.className?(' ' + params.className):'') + (params.text?'':' hover-progress-notext');
      // don't need ot addup scrollTop if the element or it parent is position:fixed
      var calcEle = ele;
      var isFixedPosition = false;
      while (calcEle && calcEle !== document.body) {
        var computedStyle = window.getComputedStyle(calcEle, null);
        if (computedStyle && computedStyle.getPropertyValue('position') === 'fixed') {
          isFixedPosition = true;
          break;
        }
        else {
          calcEle = calcEle.parentNode;
        }
      }
      var scrollTop = (document && document.scrollTop  || document.body && document.body.scrollTop  || 0);
      var top = instance.p.top !== null?instance.p.top:(e.y + instance.p.topOffset + (isFixedPosition?0:scrollTop));
      if (instance.p.right !== null) {
        bar.setAttribute('style', 'position:absolute;right:' + instance.p.right + 'px;top:' + top + 'px;');
      }
      else {
        var left = instance.p.left !== null?instance.p.left:(e.x + instance.p.leftOffset);
        bar.setAttribute('style', 'position:absolute;left:' + left + 'px;top:' + top + 'px;');
      }

      if (params.text) {
        var span = document.createElement('span');
        span.innerHTML = params.text;
        var div = bar.getElementsByTagName('div')[0];
        div.innerHTML = '&nbsp;';
        bar.insertBefore(span, div);
        this.appendChild(bar);

        // calculate the span width and set the bar width
        // first make the bar wide enough
        bar.style.width = '9999px';
        // get the span width
        span.style.width = '';
        var width = span.offsetWidth;
        // use the paddingTop as paddingLeft/Right
        var paddingTop = window.getComputedStyle(span, null).getPropertyValue('padding-top');
        paddingTop = paddingTop?paddingTop.match(/(\d+)px/):null;
        paddingTop = paddingTop?paddingTop[1]:5;
        span.style.width = '100%';
        bar.style.width = (width + paddingTop * 2) + 'px';
      }
      else {
        this.appendChild(bar);
      }

      if (instance.savedIn) {
        instance.savedIn.call(this, e);
      }
    };

    params.wait = function(e) {
      var bar = getProgressBar(this);
      if (bar) {
        bar.getElementsByTagName('div')[0].style.width = e.pct + '%';
      }

      if (instance.savedWait) {
        instance.savedWait.call(this, e);
      }
    };

    params.cancel = function(e) {
      removeProgressBar(this);

      if (instance.savedCancel) {
        instance.savedCancel.call(this, e);
      }
    };

    params.done = function(e) {
      removeProgressBar(this);
      document.body.style.cursor = '';

      if (instance.savedDone) {
        instance.savedDone.call(this, e);
      }
    };

    this.parent = new org.ellab.utils.HoverIntent(ele, params);
  }

  this._constructor(ele, params);
}

})();
