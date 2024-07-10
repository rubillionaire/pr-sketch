// var fs = require('fs')
// var makePNG = require('fast-png')
var makeTex = require('@rubenrodriguez/georender-style2png')
const featuresJSON = require('georender-pack/features.json')
const defaultsJSON = require('@rubenrodriguez/georender-style2png/defaults.json')

module.exports = function (stylesheet, opts) {
  var features = opts && opts.features ? opts.features : featuresJSON
  var defaults = opts && opts.defaults ? opts.defaults : defaultsJSON
  return new Promise((resolve, reject) => {
    makeTex({
      stylesheet,
      features,
      defaults,
    }, function (error, data) {
      if (error) return reject(error)
      // var png = makePNG.encode(data)
      // fs.writeFileSync('public/ne-stylesheet-texture.png', png)
      resolve(data)
    })
  }) 
}