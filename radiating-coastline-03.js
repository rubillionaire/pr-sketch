// radiating-coastline-03
// - fork of buffered-coast-lines-03
// - 00
// - round trips geo data into and out of the georender format with
// additional tags for shader consumption. v hard coded to get results
// - 01
// - turns out our method of considering a non-standard set of feautres
// was leading to render bugs. this must be considered further.
// for now we have the concept of tacking on additional INT and FLOAT
// tags that can be addressed by the shader
// - 02
// - updates frag of radiating coastline line strip to have a ripple based
// on the curent distance attribute and the bufferIndex. this gives nice
// outward and tangental movement
// - 03
// - adds pr mainland
// - tweaks color palette
// - adds speckle texture to coasatline
// - ? was going for more of a shadow but applying the elevation
// show cases that the elevation is not smooth across the cells
// not sure how to account for this, but this is decent for now
const mixmap = require('mixmap')
const regl = require('regl')
const resl = require('resl')
const glsl = require('glslify')
const buffer = require('@turf/buffer')
const {polygonToLine, multiPolygonToLine} = require('@turf/polygon-to-line')
const dissolve = require('@turf/dissolve')
const nearestPointOnLine = require('@turf/nearest-point-on-line').default
const { point } = require('@turf/helpers')
const distance = require('@turf/distance').default
const pointInPolygon = require('@turf/boolean-point-in-polygon').default

const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const shaders = require('@rubenrodriguez/mixmap-georender')
const prepare = require('@rubenrodriguez/mixmap-georender/prepare')
const decode = require('@rubenrodriguez/georender-pack/decode')
const featuresJSON = require('@rubenrodriguez/georender-pack/features.json')
const getImagePixels = require('get-image-pixels')
const makeStylesheet = require('./make-stylesheet')

const colors = {
  // background: hsluv([79.9, 100.0, 94.9]).concat([255.0]),
  background: [255, 243, 135].concat([255.0]),
  // foreground: hsluv([79.9, 100.0, 35.0]).concat([255.0])
  foreground: [90, 84, 0].concat([255.0])
}
colors.cssBackground = '#fff387'
colors.cssForeground = '#5a5400'
colors.glslBackground = colors.background.map(c => c/255.0)
colors.glslForeground = colors.foreground.map(c => c/255.0)

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
  backgroundColor: colors.glslBackground,  
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

const geoRenderShaders = shaders(map)
const geoRenderShadersTick = {
  lineFill: Object.assign({}, geoRenderShaders.lineFill, {
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
        float tt = 1.0 - (sin((tick + vRadiatingCoastlineBufferIndex * 80.0 + mod(t, 20.0) * 4.0)/40.0) * 0.5 + 0.5);
        gl_FragColor = vec4(vcolor.xyz, vcolor.w * x * tt);
        //gl_FragColor = vec4(mix(vec3(0,1,0), vec3(1,0,0), x), 1.0);
      }
    `,
    uniforms: Object.assign({}, geoRenderShaders.lineFill.uniforms, {
      tick: map.regl.context('tick'),
    }),
    attributes: Object.assign({}, geoRenderShaders.lineFill.attributes, {
      radiatingCoastlineBufferIndex: map.prop('radiatingCoastlineBufferIndex'),
      radiatingCoastlineBufferDistance: map.prop('radiatingCoastlineBufferDistance'),
    }),
  })
}

const coastlineShadowShader = Object.assign({}, geoRenderShaders.areas, {
  vert: glsl`
    precision highp float;
    struct Area {
      vec4 color;
      float zindex;
      vec4 labelFillColor;
      vec4 labelStrokeColor;
      float labelStrokeWidth;
      float labelFont;
      float labelFontSize;
      float labelPriority;
      float labelConstraints;
      float labelSprite;
      float labelSpritePlacement;
      float sprite;
    };

    Area readArea(sampler2D styleTexture, float featureType, float zoom, vec2 imageSize) {
      float zoomStart = 1.0;
      float zoomCount = 21.0;
      float pointHeight = 7.0*zoomCount;
      float lineHeight = 8.0*zoomCount;
      float areaStart = pointHeight + lineHeight;

      float n = 6.0;
      float px = featureType; //pixel x
      float py = areaStart + n * (floor(zoom)-zoomStart); //pixel y

      vec4 d0 = texture2D(styleTexture, vec2(
        px/imageSize.x+0.5/imageSize.x, (py+0.0)/imageSize.y + 0.5/imageSize.y)) * vec4(1,1,1,2.55);

      vec4 d1 = texture2D(styleTexture, vec2(
        px/imageSize.x+0.5/imageSize.x, (py+1.0)/imageSize.y + 0.5/imageSize.y)) * 255.0;

      vec4 d2 = texture2D(styleTexture, vec2(
        px/imageSize.x+0.5/imageSize.x, (py+2.0)/imageSize.y + 0.5/imageSize.y)) * vec4(1,1,1,2.55);

      vec4 d3 = texture2D(styleTexture, vec2(
        px/imageSize.x+0.5/imageSize.x, (py+3.0)/imageSize.y + 0.5/imageSize.y)) * vec4(1,1,1,2.55);

      vec4 d4 = texture2D(styleTexture, vec2(
        px/imageSize.x+0.5/imageSize.x, (py+4.0)/imageSize.y + 0.5/imageSize.y)) * 255.0;

      vec4 d5 = texture2D(styleTexture, vec2(
        px/imageSize.x+0.5/imageSize.x, (py+5.0)/imageSize.y + 0.5/imageSize.y)) * 255.0;

      Area area;
      area.color = d0;
      area.zindex = d1.x;
      area.labelStrokeWidth = d1.y;
      area.sprite = d1.z*256.0 + d1.w;
      area.labelFillColor = d2;
      area.labelStrokeColor = d3;
      area.labelFont = d4.x;
      area.labelFontSize = d4.y;
      area.labelPriority = d4.z;
      area.labelConstraints = d4.w;
      area.labelSprite = d5.x*256.0 + d5.y;
      area.labelSpritePlacement = d5.z;
      return area;
    }

    attribute vec2 position;
    attribute float featureType, index;
    attribute float elevation;
    uniform vec4 viewbox;
    uniform vec2 offset, size, texSize;
    uniform float aspect, featureCount, zoom;
    uniform sampler2D styleTexture;
    varying float vft, vindex, zindex;
    varying vec2 vpos;
    varying vec4 vcolor;
    varying float vElevation;
    void main () {
      vft = featureType;
      Area area = readArea(styleTexture, featureType, zoom, texSize);
      vcolor = area.color;
      vindex = index;
      zindex = area.zindex;
      vec2 p = position.xy + offset;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
        1.0/(1.0+zindex), 1);
      vpos = gl_Position.xy;
      vElevation = elevation;
    }
  `,
  frag: `
    precision highp float;
    varying vec4 vcolor;
    varying vec2 vpos;
    varying float vElevation;

    float random ( vec2 st ) {
      return fract(
        sin(
          dot( st.xy, vec2( 12.9898, 78.233 ) ) * 43758.5453123
        )
      );
    }

    void main () {
      float noramalizedElevation = vElevation * 0.5 + 0.5;
      float a = min(max(0.0, noramalizedElevation), 1.0);
      float randomThreshold = sqrt(random(vec2(random(vpos.xy), vpos.yx)));
      // float threshold = 0.9;
      float threshold = 1.0 - random(vec2(vpos.x, vElevation));
      // - this looks nice, but for some reason our elevation is not smooth
      // across the polygons
      // float threshold = 1.0 - vElevation;
      if (randomThreshold < threshold) {
        discard;
      }
      gl_FragColor = vec4(vcolor.xyz, 1.0);
    }
  `,
  attributes: Object.assign({}, geoRenderShaders.areas.attributes, {
    elevation: map.prop('elevation'),
  }),
})

console.log (coastlineShadowShader)
var includeAllTags = true
var includeIsland = false
const bufferCount = 20

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
      area: map.createDraw(geoRenderShaders.areas),
      coastlineShadow: map.createDraw(coastlineShadowShader),
      // areaT: map.createDraw(geoRender.areas),
      // areaBorder: map.createDraw(geoRender.areaBorders),
      // areaBorderT: map.createDraw(geoRender.areaBorders),
      // lineStroke: map.createDraw(geoRenderShaders.lineStroke),
      // lineStrokeT: map.createDraw(geoRenderShaders.lineStroke),
      lineFill: map.createDraw(includeAllTags ? geoRenderShadersTick.lineFill : geoRenderShaders.lineFill),
      // lineFillT: map.createDraw(geoRenderShaders.lineFill),
      // point: map.createDraw(geoRender.points),
      // pointT: map.createDraw(geoRender.points),
      // label: {},
    }

    let decodedGeorender = []

    const units = 'kilometers'
    const bufferIncrement = 1.0 // kilometers
    const bufferDistances = new Array(bufferCount).fill(0).map((_, i) => i*bufferIncrement)
    bufferDistances.forEach((bufferDistance, index) => {
      if (index === 0) return
      const buffered = buffer(neGeojson, bufferDistance, { units })
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
            'test': 'new',
          })
        },
        includeAllTags,
      })
      decodedGeorender = decodedGeorender.concat(lineGeorender.map((buf) => {
        return decode([buf])
      }))
    })
    
    if (includeIsland) {
      const neGeorenderBufs = toGeorender(neGeojson, {
        propertyMap: function (props) {
          return Object.assign(props, { 'natural': 'other' })
        },
      })

      decodedGeorender = decodedGeorender.concat(neGeorenderBufs.map((buf) => {
        return decode([buf])
      }))
    }

    // coastline-shadow:start
    let zRange = [Infinity, -Infinity]
    const zValuesLand = []
    const zValuesWater = []
    const coastlineShadowDecoded = neGeojson.features.map((feature) => {
      const coastline = polygonToLine(feature)
      const coastlinePolygon = buffer(coastline, bufferIncrement, { units })
      const georender = toGeorender(coastlinePolygon, {
        propertyMap: function (props) {
          return {
            'natural': 'coastline',
          }
        }  
      })
      const decoded = decode(georender)
      console.log({decoded})
      decoded.area.elevation = []
      for (let i = 0; i < decoded.area.positions.length; i += 2) {
        const x = decoded.area.positions[i + 0]
        const y = decoded.area.positions[i + 1]
        const p = point([x, y])
        const isOnLand = pointInPolygon(p, feature)
        const nearest = nearestPointOnLine(coastline, p, { units })
        const d = distance(p, nearest)
        const n = d/bufferIncrement
        const z = isOnLand ? n : -n
        decoded.area.elevation.push(z)
        // debug:start
        if (z < zRange[0]) zRange[0] = z
        if (z > zRange[1]) zRange[1] = z
        if (isOnLand) zValuesLand.push(z)
        else zValuesWater.push(z)
        // debug:end
      }
      return decoded
    })
    console.log({zRange})
    const sum = (a, b) => a + b
    const zValuesLandAvg = zValuesLand.reduce(sum, 0) / zValuesLand.length
    const zValuesWaterAvg = zValuesWater.reduce(sum, 0) / zValuesWater.length
    console.log('zValuesLandAvg', zValuesLandAvg)
    console.log('zValuesWater', zValuesWaterAvg)
    decodedGeorender = decodedGeorender.concat(coastlineShadowDecoded)
    // coastline-shadow:end

console.log({decodedGeorender})
    const stylesheet = {
      'natural.other': {
        'area-fill-color': colors.cssBackground,
      },
      'natural.coastline': {
        "line-fill-width": 2,
        "line-fill-color": colors.cssForeground,
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
        "area-fill-color": colors.cssForeground,
      },
    }

    const style = await makeStylesheet(stylesheet)
    // const stylePixels = getImagePixels(style)
    const stylePixels = style
    const styleTexture = map.regl.texture(style)
    const decoded = mergeDecoded(decodedGeorender)
    const geodata = prepare({
      stylePixels,
      styleTexture,
      imageSize: [style.width, style.height],
      decoded,
      propsArea: (props) => {
        return Object.assign({}, props, {
          elevation: decoded.area.elevation,  
        })
      },
      propsLineP: (props) => {
        const radiating = {
          radiatingCoastlineBufferIndex: decoded.line.radiatingCoastlineBufferIndex,
          radiatingCoastlineBufferDistance: decoded.line.radiatingCoastlineBufferDistance,
        }
        const additional = includeAllTags ? radiating : {}
        return Object.assign({}, props, additional)
      },
    })

    const props = geodata.update(map.zoom)
console.log({props})
    // setProps(draw.point.props, props.pointP)
    setProps(draw.lineFill.props, props.lineP)
    // setProps(draw.lineStroke.props, props.lineP)
    setProps(draw.coastlineShadow.props, props.area)
    // setProps(draw.areaBorder.props, props.areaBorderP)
    // setProps(draw.pointT.props, props.pointT)
    // setProps(draw.lineFillT.props, props.lineT)
    // setProps(draw.lineStrokeT.props, props.lineT)
    // setProps(draw.areaT.props, props.areaT)
    // setProps(draw.areaBorderT.props, props.areaBorderT)

    setProps(
      draw.lineFill.props,
      Object.assign({}, map._props()[0])
    )
    setProps(
      draw.coastlineShadow.props,
      Object.assign({}, map._props()[0])
    )
    console.log(draw.coastlineShadow.props)
    // - single run
    // draw.coastlineShadow.draw(draw.coastlineShadow.props)
    // draw.lineFill.draw(draw.lineFill.props)
    // - continus run
    map.regl.frame(() => {
      draw.coastlineShadow.draw(draw.coastlineShadow.props)
      draw.lineFill.draw(draw.lineFill.props)
      // map.draw()
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
      elevation: new Float32Array(areaSize),
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
      if (includeAllTags) {
        if (typeof d.line.radiatingCoastlineBufferIndex[k] === 'number') {
          decoded.line.radiatingCoastlineBufferIndex[lineOffset] = d.line.radiatingCoastlineBufferIndex[k]
        }
        if (typeof d.line.radiatingCoastlineBufferDistance[k] === 'number') {
          decoded.line.radiatingCoastlineBufferDistance[lineOffset] = d.line.radiatingCoastlineBufferDistance[k]
        }
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
      if (d.area.elevation[k]) {
        decoded.area.elevation[areaOffset] = d.area.elevation[k]
      }
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
