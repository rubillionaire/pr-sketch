// basic-stack
// premise here is to use mixmap-georender to do the basic render
// - mie-georender.nlb64 is provided by the ../osm-data/mie-prefecture
//   Makefile, and its `data/mie-georender.nlb64` command. we base64
//   encode the buffer to be restored here
// - place-island.{png,json} come from ../georender-studio/Makefile
//   and the `place-island` command.
// - 01
// - decoding buffers correctly
// - todo: render labels
// - todo: render points

const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const lpb = require('length-prefixed-buffers/without-count')
const getImagePixels = require('get-image-pixels')
const decode = require('@rubenrodriguez/georender-pack/decode')
const { default: prepare } = require('@rubenrodriguez/mixmap-georender/prepare')
const { default: GeorenderShaders } = require('@rubenrodriguez/mixmap-georender')
const b4a = require('b4a')

const mix = mixmap(regl, {
  extensions: [
    'oes_element_index_uint',
  ]
})

const prWE = [-67.356661, -65.575714] 
const prCenter = 18.220148006000038
// screen height/width = prHeight/prWidth
// screen height/width  * prWidth = prHeight
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerWidth/window.innerHeight * prHorizontal)
// const prSN = [prCenter - prHeight/2, prCenter + prHeight/2]
const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]

const map = mix.create({
  // viewbox: [-67.356661,17.854597,-65.575714,18.517377],
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: [0.5, 0.5, 0.5, 1.0],
})

window.addEventListener('resize', () => {
  map.resize(window.innerWidth, window.innerHeight)
})
document.body.style.margin = '0'
document.body.appendChild(mix.render())
document.body.appendChild(map.render({
  width: window.innerWidth,
  height: window.innerHeight,
}))

var geoRender = GeorenderShaders(map)

var draw = {
  area: map.createDraw(geoRender.areas),
  areaBorder: map.createDraw(geoRender.areaBorders),
  lineFill: map.createDraw(geoRender.lineFill),
  lineStroke: map.createDraw(geoRender.lineStroke),
  point: map.createDraw(geoRender.points),
  label: [],
}

resl({
  manifest: {
    style: {
      type: 'image',
      src: './style-textures/place-island.png',
    },
    label: {
      type: 'text',
      parser: JSON.parse,
      src: './style-textures/place-island.json',
    },
    decoded: {
      type: 'text',
      src: './georender/mie-georender.nlb64',
      parser: (data) => {
        const bufs = []
        for (const enc of data.split('\n')) {
          if (enc.trim().length === 0) continue
          const buf = Buffer.from(enc.toString(), 'base64')
          bufs.push(buf)
        }
        return decode(bufs)
      },
    }
  },
  onDone: ready,
})

function ready ({ style, decoded, label }) {
  console.log({decoded})
  var prep = prepare({
    stylePixels: getImagePixels(style),
    styleTexture: map.regl.texture(style),
    zoomStart: 1,
    zoomEnd: 21,
    imageSize: [style.width, style.height],
    decoded,
    // label,
  })
  update()
  map.on('viewbox', function () {
    update()
  })
  function update() {
    const props = prep.update(map)
    draw.area.props = [props.areaP]
    draw.areaBorder.props = [props.areaBorderP]
    draw.lineFill.props = [props.lineP]
    draw.lineStroke.props = [props.lineP]
    draw.point.props = [props.pointP]
    draw.label = props.label.atlas.map((prepared) => map.createDraw(geoRender.label(prepared)))
    for (let i = 0; i < draw.label.length; i++) {
      draw.label[i].props = props.label.glyphs[i]
    }
    map.draw()
  }
}