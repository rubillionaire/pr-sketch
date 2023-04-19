// buffered-coast-lines-01
// - 01 - use georender instead of straight geojson-to-mesh
//   - this is motivated by using its shareds and styling, perhaps not necessary,
//   we could likely align otherwise, but its a start. also getting familiar with
//   how we can use georender-style2png, looks like we must work within the 
//   feature set of OSM defined in the module. we can give geojson-georender
//   a property mapping function though
const mixmap = require('mixmap')
const regl = require('regl')
const resl = require('resl')
const glsl = require('glslify')
const buffer = require('@turf/buffer')

const toGeorender = require('georender-geojson/to-georender')
const shaders = require('mixmap-georender')
const prepare = require('mixmap-georender/prepare')
const decode = require('georender-pack/decode')
const getImagePixels = require('get-image-pixels')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const sampleRate = 32

const prWE = [-67.356661, -65.575714] 
const prCenter = 18.220148006000038
// screen height/width = prHeight/prWidth
// screen height/width  * prWidth = prHeight
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerHeight/window.innerWidth * prHorizontal)
// const prSN = [prCenter - prHeight/2, prCenter + prHeight/2]
const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]

const map = mix.create({
  // viewbox: [-67.356661,17.854597,-65.575714,18.517377],
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: [0.3, 0.3, 0.3, 1.0],  
})

// setup-map:start
let zoomer = null
window.addEventListener('keydown', function (ev) {
  if (zoomer) {
    zoomer.cancel()
    zoomer = null
  }
  if (ev.code === 'Equal') {
    zoomer = animateLinearZoom(map.getZoom(), 1, (curr,end)=>curr>=end)
    zoomer.step()
    // map.setZoom(Math.min(10,Math.round(map.getZoom()+1)))
  } else if (ev.code === 'Minus') {
    // map.setZoom(map.getZoom()-1)
    zoomer = animateLinearZoom(map.getZoom(), -1, (curr,end)=>curr<=end)
    zoomer.step()
  }
})
function animateLinearZoom (startZoom, deltaZoom, isFinished) {
  let cancel = false
  const frames = 60
  const zoomIncrement = deltaZoom/frames
  const endZoom = startZoom + deltaZoom
  let currentZoom = startZoom
  function step () {
    currentZoom += zoomIncrement
    map.setZoom(currentZoom)
    if (isFinished(currentZoom, endZoom) || cancel) return
    window.requestAnimationFrame(step)
  }
  return {
    step,
    cancel: () => {
      cancel = true
    },
  }
}

window.addEventListener('resize', () => {
  map.resize(window.innerWidth, window.innerHeight)
})
document.body.style.margin = '0'
document.body.appendChild(mix.render())
document.body.appendChild(map.render({
  width: window.innerWidth,
  height: window.innerHeight,
}))
// setup-map:end

const drawNE = map.createDraw({
  vert: `
    precision highp float;

    attribute vec2 position;
    
    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float zindex;
    uniform float aspect;

    void main () {
      vec2 p = position.xy + offset;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        (p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0,
        1.0/(1.0 + zindex),
        1);
    }
  `,
  frag: `
    precision highp float;

    uniform vec3 color;

    void main () {
      gl_FragColor = vec4(color,1);
    }
  `,
  attributes: {
    position: map.prop('positions'),
  },
  uniforms: {
    zindex: map.prop('zindex'),
    color: (context, props) => {
      if (props.color) return props.color
      else return [1,0,0]
    },
  },
  elements: map.prop('cells'),
})

resl({
  manifest: {
    neGeojson: {
      type: 'text',
      src: 'ne-10m-land-pr.json',
      parser: JSON.parse,
    },
    style: {
      type: 'image',
      src: 'ne-stylesheet-texture.png',
    },
  },
  onDone: ({ neGeojson, style }) => {
    // const bufferDistances = [1,2,3,4,5]
    // bufferDistances.forEach((bufferDistance, index) => {
    //   const percent = 1 - index/bufferDistances.length
    //   const bufferedNeMesh = geojson2mesh(buffer(neGeojson, bufferDistance, {units: 'miles'}))
    //   drawNE.props.push({
    //     positions: bufferedNeMesh.triangle.positions,
    //     cells: bufferedNeMesh.triangle.cells,
    //     color: [0,1 * percent, 0],
    //     zindex: 9 - index,
    //   })
    // })

    const geoRender = shaders(map)
    const draw = {
      area: map.createDraw(geoRender.areas),
      areaT: map.createDraw(geoRender.areas),
      areaBorder: map.createDraw(geoRender.areaBorders),
      areaBorderT: map.createDraw(geoRender.areaBorders),
      lineStroke: map.createDraw(geoRender.lineStroke),
      lineStrokeT: map.createDraw(geoRender.lineStroke),
      lineFill: map.createDraw(geoRender.lineFill),
      lineFillT: map.createDraw(geoRender.lineFill),
      point: map.createDraw(geoRender.points),
      pointT: map.createDraw(geoRender.points),
      label: {},
    }
    
    const neGeorenderBufs = toGeorender(neGeojson, {
      propertyMap: function (props) {
        return Object.assign(props, { 'natural': 'other' })
      }
    })

    const decoded = neGeorenderBufs.map((buf) => {
      return decode([buf])
    })

    const stylePixels = getImagePixels(style)
    const styleTexture = map.regl.texture(style)

    const geodata = prepare({
      stylePixels,
      styleTexture,
      decoded: mergeDecoded(decoded),
    })

    const props = geodata.update(map.zoom)
    
    setProps(draw.point.props, props.pointP)
    setProps(draw.lineFill.props, props.lineP)
    setProps(draw.lineStroke.props, props.lineP)
    setProps(draw.area.props, props.areaP)
    setProps(draw.areaBorder.props, props.areaBorderP)
    setProps(draw.pointT.props, props.pointT)
    setProps(draw.lineFillT.props, props.lineT)
    setProps(draw.lineStrokeT.props, props.lineT)
    setProps(draw.areaT.props, props.areaT)
    setProps(draw.areaBorderT.props, props.areaBorderT)

    map.draw()
  },
})

function setProps(dst, src) {
  if (dst.length === 0) dst.push({})
  Object.assign(dst[0],src)
}

function mergeDecoded(mdecoded) {
  var pointSize = 0, lineSize = 0, areaSize = 0, areaCellSize = 0, areaBorderSize = 0
  for (var i = 0; i < mdecoded.length; i++) {
    var d = mdecoded[i]
    pointSize += d.point.types.length
    lineSize += d.line.types.length
    areaSize += d.area.types.length
    areaCellSize += d.area.cells.length
    areaBorderSize += d.areaBorder.types.length
  }
  var decoded = {
    point: {
      ids: Array(pointSize).fill(0),
      types: new Float32Array(pointSize),
      positions: new Float32Array(pointSize*2),
      labels: {},
    },
    line: {
      ids: Array(lineSize).fill(0),
      types: new Float32Array(lineSize),
      positions: new Float32Array(lineSize*2),
      normals: new Float32Array(lineSize*2),
      labels: {},
    },
    area: {
      ids: Array(areaSize).fill(0),
      types: new Float32Array(areaSize),
      positions: new Float32Array(areaSize*2),
      cells: new Uint32Array(areaCellSize),
      labels: {},
    },
    areaBorder: {
      ids: Array(areaBorderSize).fill(0),
      types: new Float32Array(areaBorderSize),
      positions: new Float32Array(areaBorderSize*2),
      normals: new Float32Array(areaBorderSize*2),
      labels: {},
    },
  }
  var pointOffset = 0, lineOffset = 0, areaOffset = 0, areaCellOffset = 0, areaBorderOffset = 0
  for (var i = 0; i < mdecoded.length; i++) {
    var d = mdecoded[i]
    for (var k = 0; k < d.point.types.length; k++) {
      decoded.point.ids[pointOffset] = d.point.ids[k]
      decoded.point.types[pointOffset] = d.point.types[k]
      decoded.point.positions[pointOffset*2+0] = d.point.positions[k*2+0]
      decoded.point.positions[pointOffset*2+1] = d.point.positions[k*2+1]
      pointOffset++
    }
    Object.assign(decoded.point.labels, d.point.labels)
    for (var k = 0; k < d.line.types.length; k++) {
      decoded.line.ids[lineOffset] = d.line.ids[k]
      decoded.line.types[lineOffset] = d.line.types[k]
      decoded.line.positions[lineOffset*2+0] = d.line.positions[k*2+0]
      decoded.line.positions[lineOffset*2+1] = d.line.positions[k*2+1]
      decoded.line.normals[lineOffset*2+0] = d.line.normals[k*2+0]
      decoded.line.normals[lineOffset*2+1] = d.line.normals[k*2+1]
      lineOffset++
    }
    Object.assign(decoded.line.labels, d.line.labels)
    for (var k = 0; k < d.area.cells.length; k++) {
      decoded.area.cells[areaCellOffset++] = d.area.cells[k] + areaOffset
    }
    for (var k = 0; k < d.area.types.length; k++) {
      decoded.area.ids[areaOffset] = d.area.ids[k]
      decoded.area.types[areaOffset] = d.area.types[k]
      decoded.area.positions[areaOffset*2+0] = d.area.positions[k*2+0]
      decoded.area.positions[areaOffset*2+1] = d.area.positions[k*2+1]
      areaOffset++
    }
    Object.assign(decoded.area.labels, d.area.labels)
    for (var k = 0; k < d.areaBorder.types.length; k++) {
      decoded.areaBorder.ids[areaBorderOffset] = d.areaBorder.ids[k]
      decoded.areaBorder.types[areaBorderOffset] = d.areaBorder.types[k]
      decoded.areaBorder.positions[areaBorderOffset*2+0] = d.areaBorder.positions[k*2+0]
      decoded.areaBorder.positions[areaBorderOffset*2+1] = d.areaBorder.positions[k*2+1]
      decoded.areaBorder.normals[areaBorderOffset*2+0] = d.areaBorder.normals[k*2+0]
      decoded.areaBorder.normals[areaBorderOffset*2+1] = d.areaBorder.normals[k*2+1]
      areaBorderOffset++
    }
    Object.assign(decoded.areaBorder.labels, d.areaBorder.labels)
  }
  return decoded
}
