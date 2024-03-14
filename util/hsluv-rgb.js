const {Hsluv} = require("hsluv")

function hsluvToRgb ([h, s, l]) {
  const conv = new Hsluv()

  conv.hsluv_h = h
  conv.hsluv_s = s
  conv.hsluv_l = l

  conv.hsluvToRgb()

  const r = conv.rgb_r * 255
  const g = conv.rgb_g * 255
  const b = conv.rgb_b * 255

  return [r, g, b]
}

module.exports = hsluvToRgb