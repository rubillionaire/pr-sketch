// radiating-coastline-08
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
// - 04
// - improves coastline buffer by adding a comparison across
// points in the original geometry. if we are on the initial
// geometry, we get a z value of 0. aside that we get value
// of 1 for being inside, -1 for being outside
// - adds sqrt fragment shader, approaches the desired effect
// - 05
// - adds terrain tiles with similar speckle pattern
// - 06
// - phong lighting for terrain tiles, does not take into account
// the total height of a locaiton, just the elevation based on surrounding
// pixels
// - adds `lightPositionRealtime` search param
// - 07
// - tunes pixel density for height and light direction, values now align
// with actual light crossing the equator
// - 08
// - sorts out proper light model to also account for night mode
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
// const pointInPolygon = require('@turf/boolean-point-in-polygon').default
const robustPointInPolygon = require("robust-point-in-polygon")
const intersect = require('@turf/intersect').default
const difference = require('@turf/difference').default
const tilebelt = require('@mapbox/tilebelt')

const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const shaders = require('@rubenrodriguez/mixmap-georender')
const prepare = require('@rubenrodriguez/mixmap-georender/prepare')
const decode = require('@rubenrodriguez/georender-pack/decode')
const featuresJSON = require('@rubenrodriguez/georender-pack/features.json')
const getImagePixels = require('get-image-pixels')
const makeStylesheet = require('./make-stylesheet')

const isFloat = (n) => {
  return typeof parseFloat(n) === 'number'
}

const searchParamsString = window.location.search.slice(1)
const searchParams = new URLSearchParams(searchParamsString)
const params = {
  coastlineFade: searchParams.has('coastlineFade') ? 1 : -1,
  devicePixelRatio: searchParams.has('devicePixelRatio')
    ? +searchParams.get('devicePixelRatio')
    : window.devicePixelRatio,
  lightPosition: !searchParams.has('lightPosition') || searchParams.get('lightPosition') === 'tick'
    ? 'tick'
    : searchParams.get('lightPosition') === 'now'
      ? 'now'
      : isFloat(searchParams.get('lightPosition'))
        ? parseFloat(searchParams.get('lightPosition'))
        : 'tick'
}
console.log({params})
const colors = {
  hsluvBackground: [79.9, 100.0, 94.9].concat([255.0]),
  background: [255, 243, 135].concat([255.0]),
  hsluvForeground: [79.9, 100.0, 35.0].concat([255.0]),
  foreground: [90, 84, 0].concat([255.0]),
}
colors.cssBackground = '#fff387'
colors.cssForeground = '#5a5400'
colors.glslBackground = colors.background.map(c => c/255.0)
colors.glslForeground = colors.foreground.map(c => c/255.0)

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
  attributes: {
    antialias: true,
    // Ensure regl is aware of the pixel ratio
    pixelRatio: params.devicePixelRatio,
  },
})

const prWE = [-67.356661, -65.575714] 
const prCenterX = (prWE[0] + prWE[1]) / 2
const prCenterY = 18.220148006000038
const prHorizontal = (prWE[1] - prWE[0])
const prSN = [prCenterY - (prHorizontal/2), prCenterY + (prHorizontal/2)]

const map = mix.create({
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: colors.glslBackground,  
})
console.log('initial-zoom', map.getZoom())
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
      varying vec2 vpos;

      varying float vRadiatingCoastlineBufferIndex, vRadiatingCoastlineBufferDistance;

      float random ( vec2 st ) {
        return fract(
          sin(
            dot( st.xy, vec2( 12.9898, 78.233 ) ) * 43758.5453123
          )
        );
      }

      void main () {
        vec2 vb = vec2(viewbox.z-viewbox.x, viewbox.w-viewbox.y);
        vec2 s = vec2(size.x, size.y*aspect);
        float t = length(vdist*s/vb);
        float d = vdashLength;
        float g = vdashGap;
        float x = 1.0 - step(d, mod(t, d+g));
        float tt = 1.0 - (sin((tick + vRadiatingCoastlineBufferIndex * 40.0 + vpos.x * vpos.y * 80.0 + mod(t, 20.0) * 4.0)/40.0) * 0.5 + 0.5);
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

// terrain-img:start
// light position in sphereical coordinates
// r is the radius
// theta is the polar angle (y) - [0, pi]
// phi is the initial meridian angle (x) - [0, pi * 2]
// we are going to rotate the phi
let lightPositionPhi
let lightLonT
const lightNormalizedPhi = ({ normalizedSecond }) => {
  return ((2 * Math.PI * normalizedSecond) - 0) % (2 * Math.PI)
}
if (params.lightPosition === 'tick') {
  lightPositionPhi = ({ t }) => {
    return 2 * Math.PI * (Math.sin(t) * 0.5 + 0.5)
  }
  lightLonT = ({ t }) => {
    return (-t % 360)
  }
}
else if (params.lightPosition === 'now') {
  const secondsInADay = 24 * 60 * 60
  lightPositionPhi = () => {
    const now = new Date();
    const secondsSinceMidnight = now.getSeconds() + (60 * (now.getMinutes() + (60 * now.getHours())));
    const normalizedSecond = secondsSinceMidnight / secondsInADay
    return lightNormalizedPhi({ normalizedSecond })
  }
  lightLonT = ({ t }) => {
    const now = new Date();
    const secondsSinceMidnight = now.getSeconds() + (60 * (now.getMinutes() + (60 * now.getHours())));
    const normalizedSecond = secondsSinceMidnight / secondsInADay
    return normalizedSecond * 360 - 180
  }
}
else if (isFloat(params.lightPosition)) {
  // params.lightPosition is a point during the 24 hour cycle, normalized
  // to 0-1 range
  lightPositionPhi = () => {
    const normalizedSecond = params.lightPosition
    return lightNormalizedPhi({ normalizedSecond })
  }
  lightLonT = ({ t }) => {
    return params.lightPosition * 360 -  180
  }
}
const terrainImgTileShader = {
  attributes: {
    position: map.prop('points'),
    tcoord: [ // sw, se, nw, ne
      0, 1,
      0, 0,
      1, 1,
      1, 0
    ],
  },
  elements: [
    0, 1, 2,
    1, 2, 3
  ],
  uniforms: {
    zindex: map.prop('zindex'),
    heightMap: map.prop('texture'),
    aspect: () => window.innerWidth/window.innerHeight,
    maxElevation: 1016.1,
    colorForeground: colors.hsluvForeground,
    colorBackground: colors.hsluvBackground,
    texelSize: (context, props) => {
      const width = props.texture.width
      const height = props.texture.height
      if (width && height) return [1/width, 1/height]
      return [0, 0]
    },
    lightPosition: ({ tick }) => {
      const radius = [2000, 2000, 2000]
      const t = tick/10
      const lightLon = lightLonT({ t })
      const lightLat = 0
      const deg2rad = Math.PI/180
      const lightLonRad = lightLon * deg2rad
      const lightLatRad = lightLat * deg2rad
      // const theta = Math.PI / 2
      // const phi = lightPositionPhi({ t })
      // const x = radius[0] * Math.cos(theta) * Math.cos(phi)
      // const y = radius[1] * Math.sin(theta) * Math.sin(phi)
      // const z = radius[2] * Math.cos(theta)
      const x = radius[0] * Math.cos(lightLatRad) * Math.cos(lightLonRad)
      const y = radius[1] * Math.cos(lightLatRad) * Math.sin(lightLonRad)
      const z = radius[2] * Math.sin(lightLatRad)
      if (tick < 220) console.log(x, y, z)
      return [x, y, z]
    },
    lightAmbientAmount: 0.2,
  },
  blend: {
    enable: true,
    func: { src: 'src alpha', dst: 'one minus src alpha' },
  },
  vert: `
    precision highp float;

    attribute vec2 position;
    attribute vec2 tcoord;
    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float aspect;
    uniform float zindex;
    varying vec2 vtcoord;
    varying vec2 vpos;
    varying vec2 vPosLonLat;

    void main () {
      vec2 p = position + offset;
      vtcoord = tcoord;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
        1.0/(1.0 + zindex),
        1.0
      );
      vpos = gl_Position.xy;
      vPosLonLat = position.xy;
    }
  `,
  frag: glsl`
    precision highp float;

    uniform sampler2D heightMap;
    uniform float maxElevation;
    uniform vec4 colorForeground;
    uniform vec4 colorBackground;
    uniform vec2 texelSize;
    uniform vec3 lightPosition;
    uniform float lightAmbientAmount;

    varying vec2 vtcoord;
    varying vec2 vpos;
    varying vec2 vPosLonLat;

    const float minElevation = 0.0386;
    // const float minElevation = 0.15;
    
    #pragma glslify: hsluv = require('glsl-hsluv/hsluv-to-rgb')

    float random ( vec2 st ) {
      return fract(
        sin(
          dot( st.xy, vec2( 12.9898, 78.233 ) ) * 43758.5453123
        )
      );
    }

    float hash (vec3 p) {
      p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
      return fract(sin(dot(p, vec3(1.0, 1.1, 1.2))) * 43758.5453);
    }


    float texelToElevation (vec3 texel) {
      return -10000.0 + ((texel.r * 256.0 * 256.0 * 256.0 + texel.g * 256.0 * 256.0 + texel.b * 256.0) * 0.1);
    }

    vec3 calculateNormal(vec2 texCoords) {
      float left = texelToElevation(texture2D(heightMap, texCoords - vec2(texelSize.x, 0.0)).xyz);
      float right = texelToElevation(texture2D(heightMap, texCoords + vec2(texelSize.x, 0.0)).xyz);
      float bottom = texelToElevation(texture2D(heightMap, texCoords - vec2(0.0, texelSize.y)).xyz);
      float top = texelToElevation(texture2D(heightMap, texCoords + vec2(0.0, texelSize.y)).xyz);

      vec3 va = normalize(vec3(texelSize.x, 0, (right - left)));
      vec3 vb = normalize(vec3(0, texelSize.y, (top - bottom)));

      // Cross product of the vectors gives the normal
      return normalize(cross(va, vb));
    }

    vec3 lonLatTo3D (vec2 lonLat) {
      float lon = radians(lonLat.x);
      float lat = radians(lonLat.y);
      float x = cos(lat) * cos(lon);
      float y = cos(lat) * sin(lon);
      float z = sin(lat);
      return vec3(x, y, z);
    }

    void main () {
      float z = texelToElevation(texture2D(heightMap, vtcoord).xyz);
      float normalizedElevation = max(0.0, min(1.0, z / maxElevation));
      vec3 positionSphere = lonLatTo3D(vPosLonLat);
      vec3 lightDirectionSphere = normalize(lightPosition - positionSphere);
      float dotSphereLight = dot(positionSphere, lightDirectionSphere);
      vec3 position = vec3(vpos, z);
      if (dotSphereLight > 0.0) {
        vec3 positionNormal = calculateNormal(vtcoord);
        vec3 lightDirection = normalize(lightPosition - position);
        float dotPositionLight = dot(positionNormal, lightDirection);
        float lightnessFactor = dotPositionLight;
        float lightDiffuseAmount = max(lightnessFactor, 0.0);
        float lightAmount = clamp(lightAmbientAmount + lightDiffuseAmount, 0.0, 1.0);
        float hiddenThreshold = 1.0 - lightAmount;
        float opacity = 1.0;
        // float opacity = min(1.0, normalizedElevation + 0.3);
        float randomThreshold = sqrt(random(vec2(random(vpos.xy), vec2(vpos.yx))));
        if (randomThreshold < hiddenThreshold || normalizedElevation < minElevation) {
          opacity = 0.0;
        }
        // offset our elevation into a smaller range that prefers the foreground color
        vec3 color = mix(colorForeground.xyz - vec3(0., 0., 30.0), colorForeground.xyz + vec3(0., 0., 1.0), normalizedElevation);
        // vec4 color = mix(colorBackground, colorForeground, 1.0);
        gl_FragColor = vec4(hsluv(color.xyz), opacity);
      }
      else {
        vec4 color = colorForeground;
        float opacity = 1.0;
        float hiddenThreshold = 0.00001;
        float randomThreshold = hash(position);
        if (randomThreshold < hiddenThreshold) {
          opacity = 0.0;
        }
        gl_FragColor = vec4(hsluv(color.xyz), opacity);
      }
    }
  `,
}

const terrainImgTileManifest = [
  '8-80-114.pngraw',
  '8-80-115.pngraw',
  '8-81-114.pngraw',
  '8-81-115.pngraw',
]
const terrainImgTiles = {}
terrainImgTileManifest.forEach((file, index) => {
  const zTile = file.split('.')[0].split('-').map(Number)
  const tile = [zTile[1], zTile[2], zTile[0]]
  const geojson = tilebelt.tileToGeoJSON(tile)
  const bbox = geojson.coordinates[0] // [nw, sw, se, ne, nw]
  // bbox for box intersections
  // [w,s,e,n]
  terrainImgTiles[`${index}!${file}`] = [bbox[0][0], bbox[1][1], bbox[2][0], bbox[0][1]]
})
const terrainImgTileLayer = ({ drawCmd }) => {
  return {
    viewbox: (bbox, zoom, cb) => {
      cb(null, terrainImgTiles)
    },
    add: (key, bbox) => {
      const id = key.split('!')[0]
      const file = key.split('!')[1]
      const level = Number(file.split('-')[0])
      const prop = Object.assign({}, map._props()[0], {
        id,
        zindex: 1,
        texture: map.regl.texture(),
        points: [
          bbox[0], bbox[1], // sw
          bbox[0], bbox[3], // se
          bbox[2], bbox[1], // nw
          bbox[2], bbox[3], // ne
        ],
      })
      drawCmd.props.push(prop)
      // map.draw()
      resl({
        manifest: { tile: { type: 'image', src: `terrain-rgb/${file}` } },
        onDone: ({ tile }) => {
          prop.texture = map.regl.texture({
            data: tile,
            width: tile.width,
            height: tile.height,
            minFilter: 'linear',
            magFilter: 'linear',
          })
          // map.draw()
        },
      })
    },
    remove: (key, bbox) => {
      drawCmd.props = drawCmd.props.filter((p) => {
        return p.key !== key
      })
    },
  }
}

// terrain-img:end

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

    uniform vec4 colorForeground, colorBackground;
    uniform float coastlineFade;

    float random ( vec2 st ) {
      return fract(
        sin(
          dot( st.xy, vec2( 12.9898, 78.233 ) ) * 43758.5453123
        )
      );
    }

    void main () {
      float normalizedElevation = 1.0 - (vElevation * 0.5 + 0.5);
      float clampedElevation = min(max(0.0, normalizedElevation), 1.0);
      float randomThreshold = sqrt(random(vec2(random(vpos.xy), vpos.yx)));
      float hiddenThreshold;
      if (coastlineFade > 0.0) {
        hiddenThreshold = 1.2 - normalizedElevation;  
      }
      else {
        hiddenThreshold = 1.2 - random(vec2(vpos.x, normalizedElevation));  
      }
      
      float opacity = 1.0;
      if (randomThreshold < hiddenThreshold) {
        opacity = 0.0;
      }
      vec4 color = colorForeground;
      gl_FragColor = vec4(color.xyz, opacity);
    }
  `,
  attributes: Object.assign({}, geoRenderShaders.areas.attributes, {
    elevation: map.prop('elevation'),
  }),
  uniforms: Object.assign({}, geoRenderShaders.areas.uniforms, {
    colorBackground: colors.glslBackground,
    colorForeground: colors.glslForeground,
    coastlineFade: params.coastlineFade,
  })
})

var includeAllTags = true
var includeIsland = false
const bufferCount = 14

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
      terrainImgTile: map.createDraw(terrainImgTileShader),
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
    map.addLayer(terrainImgTileLayer({ drawCmd: draw.terrainImgTile }))

    let decodedGeorender = []

    const units = 'kilometers'
    const bufferIncrement = 1.2 // kilometers
    const bufferDistances = new Array(bufferCount).fill(0).map((_, i) => Math.pow(i*bufferIncrement, 1.15))
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
    const zValuesCoast = []
    const coastlineShadowDecoded = neGeojson.features.map((land) => {
      const bothSides = []
      const waterSideBuffer = buffer(land, bufferIncrement, { units })
      const waterSide = difference(waterSideBuffer, land)
      bothSides.push(waterSide)
      const landSideBuffer = buffer(land, -bufferIncrement, { units })
      if (landSideBuffer) {
        const landSide = difference(land, landSideBuffer)  
        bothSides.push(landSide)
      }
      return bothSides.map((coastlineSide) => {
        const georender = toGeorender(coastlineSide, {
          propertyMap: function (props) {
            return {
              'natural': 'coastline',
            }
          }  
        })
        const decoded = decode(georender)
        decoded.area.elevation = []
        for (let i = 0; i < decoded.area.positions.length; i += 2) {
          const x = decoded.area.positions[i + 0]
          const y = decoded.area.positions[i + 1]
          const p = point([x, y])
          // const isOnLand = pointInPolygon(p, land)
          let z = false
          land.geometry.coordinates.forEach((ring) => {
            const epsilon = 1e-3
            for (let i = 0; i < ring.length; i++) {
              const [rx, ry] = ring[i]
              if (x > rx - epsilon && x < rx + epsilon &&
                  y > ry - epsilon && y < ry + epsilon) {
                z = 0
                break;
              }
            }
            if (z === false) {
              z = robustPointInPolygon(ring, [x, y])
            }
          })
          // console.log(isOnLand)
          // const nearest = nearestPointOnLine(coastline, p, { units })
          // const d = distance(p, nearest)
          // const n = d/bufferIncrement
          // const z = isOnLand ? n : -n
          // const z = isOnLand ? 1 : -1
          decoded.area.elevation.push(z)
          // debug:start
          if (z < zRange[0]) zRange[0] = z
          if (z > zRange[1]) zRange[1] = z
          if (z === 1) zValuesLand.push(z)
          else if (z === 0) zValuesCoast.push(z)
          else zValuesWater.push(z)
          // debug:end
        }
        return decoded
      })
    }).reduce((accum, curr) => {
        accum = accum.concat(curr)
        return accum
      }, [])
    const sum = (a, b) => a + b
    const zValuesLandAvg = zValuesLand.reduce(sum, 0) / zValuesLand.length
    const zValuesWaterAvg = zValuesWater.reduce(sum, 0) / zValuesWater.length
    const zValuesCoastAvg = zValuesCoast.reduce(sum, 0) / zValuesCoast.length
    decodedGeorender = decodedGeorender.concat(coastlineShadowDecoded)
    // coastline-shadow:end

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
    // - single run
    // draw.coastlineShadow.draw(draw.coastlineShadow.props)
    // draw.lineFill.draw(draw.lineFill.props)
    // - continus run
    map.regl.frame(() => {
      // draw.coastlineShadow.draw(draw.coastlineShadow.props)
      // draw.lineFill.draw(draw.lineFill.props)
      // draw.terrainImgTile.draw(draw.terrainImgTile.props)
      map.draw()
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
