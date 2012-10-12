(function(){

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

org.ellab.utils.isChrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;

if (typeof XPathResult.prototype.each === 'undefined') {
  XPathResult.prototype.each = function(callback, args) {
    var i = 0;
    var length = this.snapshotLength;
    if (typeof length === 'undefined') {
      return this;
    }

    if (args) {
      for (; i < length;) {
        if (callback.apply(this.snapshotItem(i++), args) === false) {
          break;
        }
      }
    }
    else {
      for (; i < length;) {
        if (callback.call(this.snapshotItem(i), i, this.snapshotItem(i++)) === false) {
          break;
        }
      }
    }

    return this;
  };
}

org.ellab.utils.trim = function(s) {
  return (s || '').replace(/^\s+/, '').replace(/\s+$/, '');
};

org.ellab.utils.extract = function(s, prefix, suffix) {
  var i;
  if (prefix) {
    i = s.indexOf(prefix);
    if (i >= 0) {
      s = s.substring(i + prefix.length);
    }
    else {
      return '';
    }
  }

  if (suffix) {
    i = s.indexOf(suffix);
    if (i >= 0) {
      s = s.substring(0, i);
    }
    else {
      return '';
    }
  }

  return s;
};

org.ellab.utils.each = function(object, callback, args) {
  if (!object) {
    return object;
  }

  var i = 0;
  var length = object.length;
  if (typeof length === 'undefined') {
    length = object.snapshotLength;
  }

  if (typeof length === 'undefined') {
    return object;
  }

  if (args) {
    for (; i < length;) {
      if (callback.apply(object[i++], args) === false) {
        break;
      }
    }
  }
  else {
    for (; i < length;) {
      if (callback.call(object[i], i, object[i++]) === false) {
        break;
      }
    }
  }

  return object;
};

// return the first element instead of an array if the selector is simply an id
org.ellab.utils.sizzleSmart = function(selector, context, results, seed) {
  if (selector.match(/^\s*#[a-zA-Z0-9\-_]+\s*$/)) {
    return org.ellab.utils.sizzleOne(selector, context, results, seed);
  }
  else {
    return Sizzle(selector, context, results, seed);
  }
};

// wrap the result with each()
org.ellab.utils.sizzleEach = function(selector, callback, args, context, results, seed) {
  return org.ellab.utils.each(Sizzle(selector, context, results, seed), callback, args);
};

// return the first element instead of an array, useful if the caller only want the first element
org.ellab.utils.sizzleOne = function(selector, context, results, seed) {
  var res = Sizzle(selector, context, results, seed);
  if (res && res.length > 0) {
    return res[0];
  }
  else {
    return null;
  }
};

org.ellab.utils.crossOriginXMLHttpRequest_GM = function(params) {
  GM_xmlhttpRequest({
      method: params.method,
      url: params.url,
      overrideMimeType: params.overrideMimeType,
      onload: function(response){
        if (response.status == 301 || response.status == 302 || response.status == 303) {
          var loc = /Location: ([^\n]*)\n/.exec(response.responseHeaders)[1];
          GM_xmlhttpRequest({method:params.method, overrideMimeType: params.overrideMimeType, url:loc, onload:arguments.callee});
          return;
        }
        params.onload.call(this, response);
      }
  });
};

// method
// url
// onload
org.ellab.utils.crossOriginXMLHttpRequest_Chrome = function(params) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if (xhr.status == 200) {
        var response = {status:xhr.status, responseText:xhr.responseText};
        if (params.onload) {
          params.onload.call(this, response);
        }
      }
    }
  };

  xhr.open(params.method, params.url, true);
  xhr.send();
};

org.ellab.utils.crossOriginXMLHttpRequest = function(params) {
  if (this.isChrome) {
    this.crossOriginXMLHttpRequest_Chrome(params);
  }
  else {
    this.crossOriginXMLHttpRequest_GM(params);
  }
};

org.ellab.utils.getCookie = function(name) {
  if (document.cookie.length>0) {
    var start = document.cookie.indexOf(name + '=');
    if (start >= 0) {
      start = start + name.length + 1;
      var end = document.cookie.indexOf(';', start);
      if (end < 0) {
        end = document.cookie.length;
      }
      return unescape(document.cookie.substring(start, end));
    }
  }
  return '';
};

org.ellab.utils.setCookie = function(name, value, expiredays) {
  var exdate = new Date();
  exdate.setDate(exdate.getDate() + expiredays);
  document.cookie = name + '=' + escape(value) + ((expiredays===null)?'':';expires=' + exdate.toGMTString());
};

org.ellab.utils.getSession = function(name) {
  if (window.sessionStorage && window.sessionStorage.getItem) {
    return window.sessionStorage.getItem(name);
  }
  else {
    return this.getCookie(name);
  }
};

org.ellab.utils.setSession = function(name, value) {
  if (window.sessionStorage && window.sessionStorage.setItem) {
    return window.sessionStorage.setItem(name, value);
  }
  else {
    return this.setCookie(name, value);
  }
};

org.ellab.utils.getResourceURL = function(name, file) {
  if (typeof GM_getResourceURL != 'undefined') {
    return GM_getResourceURL(name);
  }
  else if (typeof chrome != 'undefined' && typeof chrome.extension != 'undefined' && typeof chrome.extension.getURL != 'undefined') {
    return chrome.extension.getURL(file);
  }
  else {
    return file;
  }
};

org.ellab.utils.calcOffsetTop = function(node) {
  var top = 0;
  while (node) {
    if (!isNaN(node.offsetTop)) top += node.offsetTop;
    node = node.offsetParent;
  }

  return top;
};

org.ellab.utils.calcOffsetLeft = function(node) {
  var left = 0;
  while (node) {
    if (!isNaN(node.offsetLeft)) left += node.offsetLeft;
    node = node.offsetParent;
  }

  return left;
};

org.ellab.utils.detectScroll = function(callback) {
  window.addEventListener('scroll', function() {
    var st = Math.max(document.documentElement.scrollTop, document.body.scrollTop);
    if (!st) {
      callback.call(window, 'top');
    }
    else if ((st + document.documentElement.clientHeight) >= document.documentElement.scrollHeight) {
      callback.call(window, 'bottom');
    }
  }, false);
};

org.ellab.utils.xpath = function(xpath, ele) {
  return document.evaluate(xpath, ele?ele:document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
};

org.ellab.utils.xpathl = function(xpath, ele) {
  return document.evaluate(xpath, ele?ele:document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
};

org.ellab.utils.getElementsByClassName = function(className, node) {
  if (!className) {
    return [];
  }
  node = node || document;
  if (node.getElementsByClassName) {
    return node.getElementsByClassName(className);
  }
  else {
    var res = document.evaluate(".//*[contains(concat(' ', @class, ' '), ' " + className + " ')]", node, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
    var result = [];
    for (var i=0;i<res.snapshotLength;i++) {
      result.push(res.snapshotItem(i));
    }
    return result;
  }
};

org.ellab.utils.decodeHTML = function(s) {
  if (s) {
    s = s.replace('&gt;', '>', 'g');
    s = s.replace('&lt;', '<', 'g');
    s = s.replace('&quot;', '"', 'g');
    s = s.replace('&amp;', '&', 'g');
  }
  return s;
};

org.ellab.utils.encodeHTML = function(s) {
  if (s) {
    s = s.replace('&', '&amp;', 'g');
    s = s.replace('>', '&gt;', 'g');
    s = s.replace('<', '&lt;', 'g');
    s = s.replace('"', '&quot;', 'g');
  }
  return s;
};

// wrapper for parsing json, fallback to eval if not supported
org.ellab.utils.parseJSON = function(s) {
  if (typeof JSON  != 'undefined' && typeof JSON.parse != 'undefined') {
    return JSON.parse(s);
  }
  else {
    return eval(s);
  }
};

org.ellab.utils.parseXML = function(s) {
  return (new window.DOMParser()).parseFromString(s, "text/xml");
};

// iterate the parent nodes until match the tag name
org.ellab.utils.parent = function(node, tag) {
  if (!node) return node;

  var parentNode = node.parentNode;

  if (!parentNode || !parentNode.tagName || parentNode.tagName.toUpperCase() == tag.toUpperCase()) return parentNode;

  return this.parent(parentNode, tag);
};

// inject an javascript to the main window, useful for call the function in window
org.ellab.utils.inject = function(fn) {
  var script = document.createElement('script');
  script.setAttribute("type", "application/javascript");
  script.textContent = '(function(){' + fn + '})();';
  document.body.appendChild(script); // run the script
  document.body.removeChild(script); // clean up
};

org.ellab.utils.changeFavicon = function(img, type, id) {
  id = id || 'ellab-favicon';
  type = type || 'image/png';
  var ss = document.getElementById(id);
  if (ss) {
    ss.href = img;
  }
  else {
    var head = document.getElementsByTagName('head')[0];

    // Create this favicon
    ss = document.createElement('link');
    ss.setAttribute('id', id);
    ss.rel = 'shortcut icon';
    ss.type = type;
    ss.href = img;
    // Remove any existing favicons
    var links = head.getElementsByTagName('link');
    for (var i=0; i<links.length; i++) {
      if (links[i].href == ss.href) return;
      if (links[i].rel == "shortcut icon" || links[i].rel=="icon")
        head.removeChild(links[i]);
    }
    // Add this favicon to the head
    head.appendChild(ss);
    // Force browser to acknowledge
    var shim = document.createElement('iframe');
    shim.width = shim.height = 0;
    document.body.appendChild(shim);
    shim.src = "icon";
    document.body.removeChild(shim);
  }
};

org.ellab.utils.hasClass = function(ele, clazz) {
  var c = ele.className;
  c = org.ellab.utils.trim(c);
  return c.match(new RegExp('^' + clazz + '$')) !== null ||
         c.match(new RegExp('^' + clazz + '\\s+')) !== null ||
         c.match(new RegExp('\\s+' + clazz + '$')) !== null ||
         c.match(new RegExp('\\s+' + clazz + '\\s+')) !== null;
};

org.ellab.utils.removeClass = function(ele, clazz) {
  var c = ele.className, trimmed;
  c = trimmed = org.ellab.utils.trim(c);
  c = c.replace(new RegExp('^' + clazz + '$'), '');
  c = c.replace(new RegExp('^' + clazz + '\\s+'), '');
  c = c.replace(new RegExp('\\s+' + clazz + '$'), '');
  c = c.replace(new RegExp('\\s+' + clazz + '\\s+'), ' ');
  if (c) {
    if (c != trimmed) {
      // actually something removed
      ele.className = c;
    }
  }
  else {
    ele.removeAttribute('class');
  }
};

org.ellab.utils.addClass = function(ele, clazz) {
  org.ellab.utils.removeClass(ele, clazz);
  ele.className += (ele.className?' ':'') + clazz;
};

org.ellab.utils.insertAfter = function(newnode, oldnode) {
  oldnode.parentNode.insertBefore(newnode, oldnode.nextSibling);
};

})();
