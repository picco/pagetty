/*

 RequireJS plugin for loading JSON files
 - depends on Text plugin and it was HEAVILY "inspired" by it as well.
 Author: Miller Medeiros
 Version: 0.2.1 (2012/04/17)
 Released under the MIT license
*/
define(["text"],function(f){var g="undefined"!==typeof JSON&&"function"===typeof JSON.parse?JSON.parse:function(a){return eval("("+a+")")},d={};return{load:function(a,b,c,e){e.isBuild&&(!1===e.inlineJSON||-1!==a.indexOf("bust="))?c(null):f.get(b.toUrl(a),function(b){e.isBuild?(d[a]=b,c(b)):c(g(b))})},normalize:function(a){-1!==a.indexOf("!bust")&&(a=a.replace("!bust",""),a+=0>a.indexOf("?")?"?":"&",a=a+"bust="+Math.round(2147483647*Math.random()));return a},write:function(a,b,c){b in d&&c('define("'+
a+"!"+b+'", function(){ return '+d[b]+";});\n")}}});