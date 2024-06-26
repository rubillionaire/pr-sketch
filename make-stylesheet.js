// var fs = require('fs')
// var makePNG = require('fast-png')
var makeTex = require('georender-style2png')
const featuresJSON = require('georender-pack/features.json')
const defaults = require('georender-style2png/defaults.json')

module.exports = function (stylesheet, opts) {
  var features = opts && opts.features ? opts.features : featuresJSON
  return new Promise((resolve, reject) => {
    makeTex({
      stylesheet,
      features,
      defaults,
    }, function (error, data) {
      if (error) return reject(error)
      // var png = makePNG.encode(data)
      resolve(data)
      // fs.writeFileSync('public/ne-stylesheet-texture.png', png)
    })
  }) 
}