/*jshint white: false, browser: true, onevar:false */
/*global chrome, console, org, moment, lscache, Sizzle, RawDeflate, Base64 */
(function() {
'use strict';

function memorySizeOf(obj) {
  var bytes = 0;

  function sizeOf(obj) {
    if(obj !== null && obj !== undefined) {
      switch(typeof obj) {
      case 'number':
        bytes += 8;
        break;
      case 'string':
        bytes += obj.length * 2;
        break;
      case 'boolean':
        bytes += 4;
        break;
      case 'object':
        var objClass = Object.prototype.toString.call(obj).slice(8, -1);
        if(objClass === 'Object' || objClass === 'Array') {
          for(var key in obj) {
            if(!obj.hasOwnProperty(key)) continue;
            sizeOf(obj[key]);
          }
        } else bytes += obj.toString().length * 2;
        break;
      }
    }
    return bytes;
  }

  function formatByteSize(bytes) {
    if(bytes < 1024) return bytes + " bytes";
    else if(bytes < 1048576) return(bytes / 1024).toFixed(2) + " KB";
    else if(bytes < 1073741824) return(bytes / 1048576).toFixed(2) + " MB";
    else return(bytes / 1073741824).toFixed(2) + " GB";
  }

  return formatByteSize(sizeOf(obj));
}

$(document).ready(function() {
  chrome.storage.local.get(null, function(items) {
    var html = '';
    var keys = Object.keys(items);
    for (var i=0 ; i<keys.length ; i++) {
      html += '<li><a href="#">' + keys[i] + '</a> (' + memorySizeOf(items[keys[i]]) + ')</li>';
    }
    if (html) {
      $("#itemlist").html('<ul>' + html + '</ul>');

      $("#itemlist a").click(function() {
        try {
          $("#json").JSONView(items[this.textContent], { collapsed: true });
        }
        catch (err) {
          $("#json").html(items[this.textContent]);
        }
        return false;
      });
    }
  });
});

})();
