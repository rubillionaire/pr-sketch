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
const decode = require('@rubenrodriguez/georender-pack/decode')
const { decode: decodePng } = require('fast-png')
const { default: prepare } = require('@rubenrodriguez/mixmap-georender/prepare')
const { default: GeorenderShaders, pickfb } = require('@rubenrodriguez/mixmap-georender')
// const lpb = require('length-prefixed-buffers')
// const b4a = require('b4a')

const mix = mixmap(regl, {
  extensions: [
    'oes_element_index_uint',
    'angle_instanced_arrays',
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
console.log([prWE[0],prSN[0],prWE[1],prSN[1]])

const map = mix.create({
  // viewbox: [-67.356661,17.854597,-65.575714,18.517377],
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: [0.5, 0.5, 0.5, 1.0],
  pickfb,
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
  areaP: map.createDraw(geoRender.areas),
  areaBorderP: map.createDraw(geoRender.areaBorders),
  lineFillP: map.createDraw(geoRender.lineFill),
  lineStrokeP: map.createDraw(geoRender.lineStroke),
  pointP: map.createDraw(geoRender.points),
  label: [],
}

resl({
  manifest: {
    style: {
      type: 'binary',
      src: './style-textures/georender-basic-setup-style.png',
      parser: (data) => {
        return decodePng(data)
      },
    },
    label: {
      type: 'text',
      parser: JSON.parse,
      src: './style-textures/georender-basic-setup-label.json',
    },
    decoded: {
      type: 'text',
      src: './georender/basic-stack-georender.nlb64',
      parser: (data) => {
        const bufs = []
        for (const enc of data.split('\n')) {
          if (enc.trim().length === 0) continue
          const buf = Buffer.from(enc.toString(), 'base64')
          bufs.push(buf)
        }
        return decode(bufs)
      },
      /// does not work, tried:
      /// Buffer.from
      /// b4a.from
      /// new Uint8Array
      // type: 'binary',
      // src: './georender/basic-stack-georender.lpb',
      // parser: (data) => {
      //   const buf = b4a.from(data)
      //   console.log({buf})
      //   const bufs = lpb.decode(buf)
      //   console.log({bufs})
      //   const georender = decode(bufs)
      //   console.log({georender})
      //   return georender
      // },
    }
  },
  onDone: ready,
})

function ready ({ style, decoded, label }) {
  console.log(decoded)
  const stylePixels = style.data
  var prep = prepare({
    stylePixels,
    styleTexture: map.regl.texture(style),
    zoomStart: 1,
    zoomEnd: 21,
    imageSize: [style.width, style.height],
    decoded,
    label,
  })
  update()
  map.on('viewbox', function () {
    update()
  })
  window.addEventListener('click', function (event) {
    console.log('click')
    geoRender.pick(event, (err, picked) => {
      if (err) return console.log(err)
      const { index, pickType } = picked
      if (!draw[pickType]) return console.log(`no pickType: ${pickType}`)
      let ref = null
      for (let i = 0; i < draw[pickType].props.length; i++) {
        const p = draw[pickType].props[i]
        if (p.indexToId[index] !== undefined) {
          ref = { id: p.indexToId[index], pi: i }
          break
        }
      }
      if (ref) {
        const labels = (draw[pickType].props[ref.pi].labels[ref.id] || [])
          .map(l => l.split('=')[1])
        console.log(Object.assign({ labels }, ref))
      }
      else console.log(`no matching feature id found. index: ${index}, pickType: ${pickType}`)
    })
  })
  function update() {
    const props = prep.update(map)
    draw.areaP.props = [props.areaP]
    draw.areaBorderP.props = [props.areaBorderP]
    draw.lineFillP.props = [props.lineP]
    draw.lineStrokeP.props = [props.lineP]
    draw.pointP.props = [props.pointP]
    draw.label = props.label.atlas.map((prepared) => map.createDraw(geoRender.label(prepared)))
    for (let i = 0; i < draw.label.length; i++) {
      draw.label[i].props = props.label.glyphs[i]
    }
    map.draw()
  }
}