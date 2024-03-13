// radiating-coastline-00
// - fork of buffered-coast-lines-03
// - 00
// - round trips geo data into and out of the georender format with
// additional tags for shader consumption. v hard coded to get results
const mixmap = require('mixmap')
const regl = require('regl')
const resl = require('resl')
const glsl = require('glslify')
const buffer = require('@turf/buffer')
const {polygonToLine, multiPolygonToLine} = require('@turf/polygon-to-line')
const dissolve = require('@turf/dissolve')

const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const shaders = require('@rubenrodriguez/mixmap-georender')
const prepare = require('@rubenrodriguez/mixmap-georender/prepare')
const decode = require('@rubenrodriguez/georender-pack/decode')
const getImagePixels = require('get-image-pixels')
const makeStylesheet = require('./make-stylesheet')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const prWE = [-67.356661, -65.575714] 
const prCenter = 18.220148006000038
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerWidth/window.innerHeight * prHorizontal)
const prSN = [prCenter - (prHorizontal/2), prCenter + (prHorizontal/2)]

const map = mix.create({
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: [0.5, 0.5, 0.5, 1.0],  
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

const geoRender = shaders(map)
const geoRenderTick = {
  lineFill: Object.assign({}, geoRender.lineFill, {
    vert: glsl`
      precision highp float;
      #pragma glslify: Line = require('glsl-georender-style-texture/line.h');
      #pragma glslify: readLine = require('glsl-georender-style-texture/line.glsl');
      attribute vec2 position, normal, dist;
      attribute float featureType, index;
      attribute float radiatingCoastlineBufferIndex, radiatingCoastlineBufferDistance;
      uniform vec4 viewbox;
      uniform vec2 offset, size;
      uniform float featureCount, aspect, zoom;
      uniform sampler2D styleTexture;
      varying float vft, vindex, zindex, vdashLength, vdashGap;
      varying vec2 vpos, vnorm, vdist;
      varying vec4 vcolor;
      varying float vRadiatingCoastlineBufferIndex, vRadiatingCoastlineBufferDistance;
      void main () {
        vft = featureType;
        Line line = readLine(styleTexture, featureType, zoom, featureCount);
        vcolor = line.fillColor;
        vdashLength = line.fillDashLength;
        vdashGap = line.fillDashGap;
        vindex = index;
        zindex = line.zindex + 0.1;
        vec2 p = position.xy + offset;
        vnorm = normalize(normal)*(line.fillWidth/size);
        vdist = dist;
        gl_Position = vec4(
          (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
          ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
          1.0/(1.0+zindex), 1);
        gl_Position += vec4(vnorm, 0, 0);
        vpos = gl_Position.xy;
        vRadiatingCoastlineBufferIndex = radiatingCoastlineBufferIndex;
        vRadiatingCoastlineBufferDistance = radiatingCoastlineBufferDistance;
      }
    `,
    frag: `
      precision highp float;

      uniform vec4 viewbox;
      uniform vec2 size;
      uniform float aspect;
      uniform float tick;
      varying float vdashLength, vdashGap;
      varying vec2 vdist;
      varying vec4 vcolor;

      varying float vRadiatingCoastlineBufferIndex, vRadiatingCoastlineBufferDistance;

      void main () {
        vec2 vb = vec2(viewbox.z-viewbox.x, viewbox.w-viewbox.y);
        vec2 s = vec2(size.x, size.y*aspect);
        float t = length(vdist*s/vb);
        float d = vdashLength;
        float g = vdashGap;
        float x = 1.0 - step(d, mod(t, d+g));
        float tt = sin(tick/10.0) * 0.5 + 0.5 * vRadiatingCoastlineBufferIndex;
        // float tt = sin(tick/10.0) * 0.5 + 0.5;
        gl_FragColor = vec4(vcolor.xyz, vcolor.w * x * tt);
        //gl_FragColor = vec4(mix(vec3(0,1,0), vec3(1,0,0), x), 1.0);
      }
    `,
    uniforms: Object.assign({}, geoRender.lineFill.uniforms, {
      tick: map.regl.context('tick'),
    }),
    attributes: Object.assign({}, geoRender.lineFill.attributes, {
      radiatingCoastlineBufferIndex: map.prop('radiatingCoastlineBufferIndex'),
      radiatingCoastlineBufferDistance: map.prop('radiatingCoastlineBufferDistance'),
    }),
  })
}
console.log(geoRenderTick.lineFill)

const featureTypes = [
  'natural.other',
  'natural.coastline',
  'radiatingCoastlineBufferIndex',
  'radiatingCoastlineBufferDistance',
]

resl({
  manifest: {
    neGeojson: {
      type: 'text',
      src: 'ne-10m-land-pr.json',
      parser: JSON.parse,
    },
  },
  onDone: async ({ neGeojson }) => {

    const draw = {
      // area: map.createDraw(geoRender.areas),
      // areaT: map.createDraw(geoRender.areas),
      // areaBorder: map.createDraw(geoRender.areaBorders),
      // areaBorderT: map.createDraw(geoRender.areaBorders),
      // lineStroke: map.createDraw(geoRender.lineStroke),
      // lineStrokeT: map.createDraw(geoRender.lineStroke),
      lineFill: map.createDraw(geoRenderTick.lineFill),
      // lineFillT: map.createDraw(geoRender.lineFill),
      // point: map.createDraw(geoRender.points),
      // pointT: map.createDraw(geoRender.points),
      // label: {},
    }

    let decoded = []

    const bufferCount = 20
    const bufferDistances = new Array(bufferCount).fill(0).map((_, i) => i*0.5)
    bufferDistances.forEach((bufferDistance, index) => {
      const buffered = buffer(neGeojson, bufferDistance, {units: 'miles'})
      const dissolved = dissolve(buffered)
      dissolved.features = dissolved.features.map((feature) => {
        let line = feature
        if (feature.geometry.type === 'Polygon') {
          line = polygonToLine(feature)
        }
        else if (feature.geometry.type === 'MultiPolygon') {
          line = multiPolygonToLine(feature)
        }
        line.properties['radiatingCoastlineBufferIndex'] = index/bufferCount
        line.properties['radiatingCoastlineBufferDistance'] = bufferDistance
        return line
      })
      const lineGeorender = toGeorender(dissolved, {
        propertyMap: function (props) {
          return Object.assign(props, {
            'natural': 'coastline',
            'name': 'puerto rico',
          })
        },
        featureTypes,
        includeAllTags: true,
      })
      decoded = decoded.concat(lineGeorender.map((buf) => {
        return decode([buf])
      }))
    })
    
    // const neGeorenderBufs = toGeorender(neGeojson, {
    //   propertyMap: function (props) {
    //     return Object.assign(props, { 'natural': 'other' })
    //   },
    //   featureTypes,
    // })

    // decoded = decoded.concat(neGeorenderBufs.map((buf) => {
    //   return decode([buf])
    // }))
console.log({decoded})
    const stylesheet = {
      'natural.other': {
        'area-fill-color': '#db22c6',
      },
      'natural.coastline': {
        "line-fill-width": 3,
        "line-fill-color": "#db22c6",
        "line-fill-style": "dash",
        "line-fill-dash-length": 30,
        "line-fill-dash-gap": 6,
        "line-stroke-color": "#ffb6c1",
        "line-stroke-width": 0,
        "line-stroke-style": "dash",
        "line-stroke-dash-color": "#000",
        "line-stroke-dash-length": 0,
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
      imageSize: [style.width, style.height],
      decoded: mergeDecoded(decoded),
      featureCount: featureTypes.length,
    })

    const props = geodata.update(map.zoom)
console.log({props})    
    // setProps(draw.point.props, props.pointP)
    setProps(draw.lineFill.props, props.lineP)
    // setProps(draw.lineStroke.props, props.lineP)
    // setProps(draw.area.props, props.areaP)
    // setProps(draw.areaBorder.props, props.areaBorderP)
    // setProps(draw.pointT.props, props.pointT)
    // setProps(draw.lineFillT.props, props.lineT)
    // setProps(draw.lineStrokeT.props, props.lineT)
    // setProps(draw.areaT.props, props.areaT)
    // setProps(draw.areaBorderT.props, props.areaBorderT)

    console.log(draw.lineFill.props[0])
    // - single run
    setProps(
      draw.lineFill.props,
      Object.assign({}, map._props()[0])
    )
    // draw.lineFill.draw(draw.lineFill.props)
    // - continus run
    map.regl.frame(() => {
      draw.lineFill.draw(draw.lineFill.props)    
    })
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
      radiatingCoastlineBufferIndex: new Float32Array(lineSize),
      radiatingCoastlineBufferDistance: new Float32Array(lineSize),
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
    console.log({d})
    for (var k = 0; k < d.line.types.length; k++) {
      decoded.line.ids[lineOffset] = d.line.ids[k]
      decoded.line.types[lineOffset] = d.line.types[k]
      decoded.line.positions[lineOffset*2+0] = d.line.positions[k*2+0]
      decoded.line.positions[lineOffset*2+1] = d.line.positions[k*2+1]
      decoded.line.normals[lineOffset*2+0] = d.line.normals[k*2+0]
      decoded.line.normals[lineOffset*2+1] = d.line.normals[k*2+1]
      if (typeof d.line.radiatingCoastlineBufferIndex[k] === 'number') {
        decoded.line.radiatingCoastlineBufferIndex[lineOffset] = d.line.radiatingCoastlineBufferIndex[k]
      }
      if (typeof d.line.radiatingCoastlineBufferDistance[k] === 'number') {
        decoded.line.radiatingCoastlineBufferDistance[lineOffset] = d.line.radiatingCoastlineBufferDistance[k]
      }
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
