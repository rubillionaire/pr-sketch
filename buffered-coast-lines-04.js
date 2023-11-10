// buffered-coast-lines-04
// - 01 - use georender instead of straight geojson-to-mesh
//   - this is motivated by using its shareds and styling, perhaps not necessary,
//   we could likely align otherwise, but its a start. also getting familiar with
//   how we can use georender-style2png, looks like we must work within the 
//   feature set of OSM defined in the module. we can give geojson-georender
//   a property mapping function though
// - 02 - make the coast line buffers, they are dissolved so they meet up
//   with each other.
// - 03 - try with world, and maybe better colors?
//   - buggy output
// - 04 - try to clip buffers so they don't cross the world
//   - errors
const mixmap = require('mixmap')
const regl = require('regl')
const resl = require('resl')
const glsl = require('glslify')
const buffer = require('@turf/buffer')
const {polygonToLine, multiPolygonToLine} = require('@turf/polygon-to-line')
const dissolve = require('@turf/dissolve')

const toGeorender = require('georender-geojson/to-georender')
const shaders = require('mixmap-georender')
const prepare = require('mixmap-georender/prepare')
const decode = require('georender-pack/decode')
const clip = require('polygon-clipping')
const getImagePixels = require('get-image-pixels')
const makeStylesheet = require('./make-stylesheet')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const map = mix.create({
  viewbox: [-180, -90, 180, 90],
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


resl({
  manifest: {
    neGeojson: {
      type: 'text',
      src: 'ne-110m-land.json',
      parser: JSON.parse,
    },
  },
  onDone: async ({ neGeojson }) => {

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

    let decoded = []

    function clipper (coords) {
      return clip.intersection(coords, [[-180, -90], [-180, 90], [180, 90], [180, -90]])
    }

    const bufferDistances = new Array(20).fill(0).map((_, i) => i + 1)
    bufferDistances.forEach((bufferDistance, index) => {
      const percent = 1 - index/bufferDistances.length
      const buffered = buffer(neGeojson, bufferDistance * + index, {units: 'miles'})
      const dissolved = dissolve(buffered)
      dissolved.features = dissolved.features.map((feature) => {
        if (feature.geometry.type === 'Polygon') {
          feature.geometry.coordinates = clipper(feature.geometry.coordinates)
          const line = polygonToLine(feature)
          return line
        }
        else if (feature.geometry.type === 'MultiPolygon') {
          feature.geometry.coordinates = clipper(feature.geometry.coordinates)
          const line = multiPolygonToLine(feature)
          return line
        }
        else return feature
      })
      const lineGeorender = toGeorender(dissolved, {
        propertyMap: function (props) {
          return Object.assign(props, { 'natural': 'coastline' })
        }  
      })
      decoded = decoded.concat(lineGeorender.map((buf) => {
        return decode([buf])
      }))
    })
    
    const neGeorenderBufs = toGeorender(neGeojson, {
      propertyMap: function (props) {
        return Object.assign(props, { 'natural': 'other' })
      }
    })

    decoded = decoded.concat(neGeorenderBufs.map((buf) => {
      return decode([buf])
    }))

    const stylesheet = {
      'natural.other': {
        'area-fill-color': '#db22c6',
      },
      'natural.coastline': {
        "line-fill-width": 2,
        "line-fill-color": "#1f9393",
        "line-fill-style": "dash",
        "line-fill-dash-length": 30,
        "line-fill-dash-gap": 6,
        "line-stroke-color": "#ffb6c1",
        "line-stroke-width": 2,
        "line-stroke-style": "dash",
        "line-stroke-dash-color": "#000",
        "line-stroke-dash-length": 3,
        "line-stroke-dash-gap": 36,
        "line-opacity": 100,
        "line-zindex": 5.0,
        "line-label-fill-opacity": 100,
        "line-label-stroke-opacity": 100,
      },
    }

    const style = await makeStylesheet(stylesheet)
    // const stylePixels = getImagePixels(style)
    const stylePixels = style
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
