// scroll-day-n-nite
// - fork of radiating-coastline-16
// - build note, uses `glsl-georender-style-texture`  @ 4.0.2
// - 00
// - 01
// - 02
// - refactor data so that all the processing only happens once
// - 03
// - add displayThreshold to config options for drawing
//    radiatingCoastline with

const resl = require('resl')
const glsl = require('glslify')
const buffer = require('@turf/buffer')
const {polygonToLine, multiPolygonToLine} = require('@turf/polygon-to-line')
const dissolve = require('@turf/dissolve')
const nearestPointOnLine = require('@turf/nearest-point-on-line').default
const { point } = require('@turf/helpers')
const distance = require('@turf/distance').default
const pointInPolygon = require('@turf/boolean-point-in-polygon').default
const robustPointInPolygon = require("robust-point-in-polygon")
const intersect = require('@turf/intersect').default
const difference = require('@turf/difference').default
const tilebelt = require('@mapbox/tilebelt')
const vectorizeText = require("vectorize-text")

const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const { default: shaders, pickFrag, pickfb } = require('@rubenrodriguez/mixmap-georender')
const { default: prepare } = require('@rubenrodriguez/mixmap-georender/prepare')
const decode = require('@rubenrodriguez/georender-pack/decode')
const featuresJSON = require('@rubenrodriguez/georender-pack/features.json')
const getImagePixels = require('get-image-pixels')
const cityJson = require('../util/pr-cities-population-2024.json')
const tilePixelToLonLat = require('../util/tile-pixel-to-lon-lat')
const { create } = require('gl-vec3')

module.exports = {
  createMap,
  createProps,
  createDraws,
  spreadProps,
}

const isFloat = (n) => {
  return typeof parseFloat(n) === 'number'
}
const searchParamsString = window.location.search.slice(1)
const searchParams = new URLSearchParams(searchParamsString)
const params = {
  view: !searchParams.has('view')
    ? 'pr'
    : searchParams.get('view') === 'world'
      ? 'world'
      : 'pr',
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
        : 'tick',
  terrainZoom: searchParams.has('terrainZoom')
    ? searchParams.get('terrainZoom')
    : '9'
}
console.log({params})

const defaultColors = {
  // hsluvLight: [79.9, 100.0, 94.9].concat([255.0]),
  light: [255, 243, 135],
  // hsluvDark: [79.9, 100.0, 35.0].concat([255.0]),
  dark: [90, 84, 0],
}

const prWE = [-67.556661, -65.275714] 
const prCenterX = (prWE[0] + prWE[1]) / 2
const prCenterY = 18.220148006000038
const prHorizontal = (prWE[1] - prWE[0])
const prSN = [prCenterY - (prHorizontal/2), prCenterY + (prHorizontal/2)]
let startViewbox = [prWE[0],prSN[0],prWE[1],prSN[1]]
if (params.view === 'world') {
  const we = [-180, 180]
  const center = (we[0] + we[1]) / 2
  const horizontal = Math.abs(we[1] - we[0])
  const sn = [center - horizontal/2, center + horizontal/2]
  startViewbox = [we[0], sn[0], we[1], sn[1]]
}

// globalContext:start
// light position in sphereical coordinates
// r is the radius
// theta is the polar angle (y) - [0, pi]
// phi is the initial meridian angle (x) - [0, pi * 2]
// we are going to rotate the phi
let lightLonT
if (params.lightPosition === 'tick') {
  lightLonT = ({ t }) => {
    return (-t * 5 % 360)
  }
}
else if (params.lightPosition === 'now') {
  const secondsInADay = 24 * 60 * 60
  lightLonT = ({ t }) => {
    const now = new Date();
    const secondsSinceMidnight = now.getSeconds() + (60 * (now.getMinutes() + (60 * now.getHours())));
    const normalizedSecond = secondsSinceMidnight / secondsInADay
    return -normalizedSecond * 360
  }
}
else if (isFloat(params.lightPosition)) {
  lightLonT = ({ t }) => {
    return -params.lightPosition * 360
  }
}
const lightPositionTick = ({ tick }) => {
  const radius = [2000, 2000, 2000]
  const t = tick/10
  const lightLon = lightLonT({ t })
  const lightLat = 0
  const deg2rad = Math.PI/180
  const lightLonRad = lightLon * deg2rad
  const lightLatRad = lightLat * deg2rad
  const x = radius[0] * Math.cos(lightLatRad) * Math.cos(lightLonRad)
  const y = radius[1] * Math.cos(lightLatRad) * Math.sin(lightLonRad)
  const z = radius[2] * Math.sin(lightLatRad)
  // if (tick < 220) console.log(x, y, z)
  return [x, y, z]
}
// globalContext:end

function glslifyColors (colors) {
  for (const key in colors) {
    if (colors[key].length === 3) {
      colors[key] = colors[key].concat([255.0])  
    }
    const glslColor = colors[key].map(c => c/255.0)
    colors[`glsl${key.slice(0, 1).toUpperCase()}${key.slice(1)}`] = glslColor
  }
}

var includeAllTags = true

function createMap ({
  mix,
  name,
  viewbox=startViewbox,
  colors=defaultColors,
}) {

  glslifyColors(colors)

  const map = mix.create({
    viewbox,
    backgroundColor: colors.glslLight,
    pickfb,
  })

  return {
    map,
    name,
  }
}

function reslPromise ({ manifest }) {
  return new Promise((resolve, reject) => {
    resl({
      manifest,
      onDone: (assets) => {
        resolve(assets)
      },
      onError: (error) =>{
        reject(error)
      },
    })
  })
}

async function createProps ({ map, includeIsland=false }) {
  // terrain tiles : start
  const terrainImgFileNames = [
    '9-160-229.pngraw',
    '9-160-230.pngraw',
    '9-161-229.pngraw',
    '9-161-230.pngraw',
    '9-162-229.pngraw',
    '9-162-230.pngraw',
    '9-163-229.pngraw',
    '9-163-230.pngraw',
  ]

  const manifest = terrainImgFileNames.map((tileName) => {
      return {
        [tileName]: {
          type: 'image',
          src: `terrain-rgb/${tileName}`
        },
      }
    }).concat([{
      neGeojson: {
        type: 'text',
        src: 'ne-10m-land-pr.json',
        parser: JSON.parse,
      }
    }])
    .reduce((acc, curr) => {
      Object.assign(acc, curr)
      return acc
    }, {})

  const assets = await reslPromise({ manifest })
  let neGeojson = null
  const terrainImgElements = []

  for (const assetName in assets) {
    const asset = assets[assetName]
    if (terrainImgFileNames.includes(assetName)) {
      terrainImgElements.push({
        assetName,
        tile: asset,
      })
    }
    else {
      neGeojson = asset
    }
  }

  const terrainImgCmdProps = []
  for (const { tile, assetName } of terrainImgElements) {
    const tileKey = assetName.split('.')[0].split('-').map(Number)
    const clipped = clipTile({ tile, tileKey, features: neGeojson.features })
    const prop = Object.assign({}, {
      assetName,
      id: terrainImgFileNames.indexOf(assetName),
      zindex: 1,
      texture: map.regl.texture({
        data: clipped,
        width: tile.width,
        height: tile.height,
        minFilter: 'linear',
        magFilter: 'linear',
      })
    })
    terrainImgCmdProps.push(prop)
  }

  function terrainLayerProps ({ drawCmd }) {
    const terrainImgTiles = {}
    terrainImgFileNames.forEach((file, index) => {
      const zTile = file.split('.')[0].split('-').map(Number)
      const tile = [zTile[1], zTile[2], zTile[0]]
      const geojson = tilebelt.tileToGeoJSON(tile)
      const bbox = geojson.coordinates[0] // [nw, sw, se, ne, nw]
      // bbox for box intersections
      // [w,s,e,n]
      terrainImgTiles[`${index}!${file}`] = [bbox[0][0], bbox[1][1], bbox[2][0], bbox[0][1]]
    })
    return {
      viewbox: (bbox, zoom, cb) => {
        cb(null, terrainImgTiles)
      },
      add: (key, bbox) => {
        const [index, assetName] = key.split('!')
        const prop = terrainImgCmdProps.find(p => p.assetName === assetName)
        prop.points = [
          bbox[0], bbox[1], // sw
          bbox[0], bbox[3], // se
          bbox[2], bbox[1], // nw
          bbox[2], bbox[3], // ne
        ]
        drawCmd.props.push(prop)
      },
      remove: (key, bbox) => {
        const [index, assetName] = key.split('!')
        drawCmd.props = drawCmd.props.filter(p => p.assetName !== assetName)
      },
    }
  }
  // terrain tiles : end
  
  // decoded-georender : start
  // radiating-coastline : start
  const bufferCount = 10
  let decodedGeorender = []

  const units = 'kilometers'
  const bufferIncrement = 1.4 // kilometers
  const bufferDistances = new Array(bufferCount).fill(0).map((_, i) => Math.pow(i*bufferIncrement, 1.3))
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
  // radiating-coastline : end
  // coastline-shadow:start
  let zRange = [Infinity, -Infinity]
  const zValuesLand = []
  const zValuesWater = []
  const zValuesCoast = []
  const coastlineShadowDecoded = neGeojson.features.map((land) => {
    const bothSides = []
    const waterSideBuffer = buffer(land, bufferIncrement * 0.3, { units })
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
  // decoded-georender : end
  
  // style-georender : start
  // // stylesheet comes from `georender-studio`
  const style = await (() => {
    const img = new Image()
    const p = new Promise((resolve, reject) => {
      img.onerror = function (error) {
        reject(error)
      }
      img.onload = function () {
        resolve(img)
      }
    })
    img.src = './style-textures/pr-radiating-coastline.png'
    return p
  })()
  // const style = await makeStylesheet(stylesheet)
  const stylePixels = getImagePixels(style)
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
  // style-georender : end

  const createCityProps = ({ dimensions, cities }) => {
    const positions = []
    const anchors = []
    const cells = []
    const population = []
    const index = []
    // vec2(tickChange : number, growing : 0 | 1)
    const highlight = []
    let maxPopulation = 0 
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i]
      const {coordinates} = city
      if (city.population > maxPopulation) maxPopulation = city.population
      // each city has two triangles to produce its square
      anchors.push(
        coordinates[0], coordinates[1],
        coordinates[0], coordinates[1],
        coordinates[0], coordinates[1],
        coordinates[0], coordinates[1]
      )
      positions.push(
        [coordinates[0] - dimensions[0]/2, coordinates[1] - dimensions[1]/2],
        [coordinates[0] - dimensions[0]/2, coordinates[1] + dimensions[1]/2],
        [coordinates[0] + dimensions[0]/2, coordinates[1] + dimensions[1]/2],
        [coordinates[0] + dimensions[0]/2, coordinates[1] - dimensions[1]/2]
      )
      cells.push(
        positions.length - 1 - 3,
        positions.length - 1 - 2,
        positions.length - 1 - 1,
        positions.length - 1 - 3,
        positions.length - 1 - 1,
        positions.length - 1 - 0
      )
      population.push(
        city.population,
        city.population,
        city.population,
        city.population
      )
      index.push(i, i, i, i)
      highlight.push(
        [0, 1],
        [0, 1],
        [0, 1],
        [0, 1]
      )
    }

    return {
      positions,
      anchors,
      cells,
      dimensions,
      maxPopulation,
      population,
      index,
      highlight,
      setHighlight,
    }

    function setHighlight (toHighlight, { tick }) {
      for (let i = 0; i < cities.length; i++) {
        const index = i * 4
        if (toHighlight.includes(i) && highlight[index + 0][1] < 0.5) {
          highlight[index + 0][0] = tick
          highlight[index + 0][1] = 1
          highlight[index + 1][0] = tick
          highlight[index + 1][1] = 1
          highlight[index + 2][0] = tick
          highlight[index + 2][1] = 1
          highlight[index + 3][0] = tick
          highlight[index + 3][1] = 1
        }
        else if (!toHighlight.includes(i) && highlight[index + 0][1] > 0.5) {
          highlight[index + 0][0] = tick
          highlight[index + 0][1] = 0
          highlight[index + 1][0] = tick
          highlight[index + 1][1] = 0
          highlight[index + 2][0] = tick
          highlight[index + 2][1] = 0
          highlight[index + 3][0] = tick
          highlight[index + 3][1] = 0
        }
      }
    }
  }

  props.city = createCityProps({ dimensions: [0.1, 0.1], cities: cityJson })
  props.terrainLayer = terrainLayerProps

  return {
    props,
    cityJson,
  }

  function clipTile ({ tile, tileKey, features }) {
    const [zoom, tileX, tileY] = tileKey
    let imgPixels = getImagePixels(tile)
    for (let pixelX = 0; pixelX < tile.width; pixelX++) {
      for (let pixelY = 0; pixelY < tile.height; pixelY++) {
        const coords = tilePixelToLonLat(tileX, tileY, pixelX, pixelY, zoom)
        let isWithin = false
        for (const feature of features) {
          const ptInPl = pointInPolygon(point(coords), feature)
          if (ptInPl) {
            isWithin = true
            break;
          }
        }
        if (isWithin === false) {
          const redIndex = pixelY * (tile.width * 4) + pixelX * 4
          const blueIndex = redIndex + 1
          const greenIndex = redIndex + 2
          const alphaIndex = redIndex + 3
          imgPixels[redIndex] = 0
          imgPixels[blueIndex] = 0
          imgPixels[greenIndex] = 0
          imgPixels[alphaIndex] = 0
        }
      }
    }
    return imgPixels
  }
}

function createDraws ({
  map,
  colors=defaultColors,
  radiatingCoastlineOpts={},
  selectCity=0.0,
}) {
  glslifyColors(colors)

  const globalContext = {
    lightPosition: lightPositionTick({ tick: 0 }),
    lightAmbientAmount: 0.2,
    lightTransitionBuffer: 0.25,
  }

  const radiatingCoastlineTick = radiatingCoastlineOpts.tick !== undefined
    ? radiatingCoastlineOpts.tick
    : map.regl.context('tick')

  const radiatingCoastlineDisplayThreshold = radiatingCoastlineOpts.displayThreshold
    ? radiatingCoastlineOpts.displayThreshold
    : 0.0


  const geoRenderShaders = shaders(map)
  const geoRenderShadersTick = {
    lineFill: Object.assign({}, geoRenderShaders.lineFill, {
      uniforms: Object.assign({}, geoRenderShaders.lineFill.uniforms, {
        tick: radiatingCoastlineTick,
        lightPosition: () => globalContext.lightPosition,
        colorForeground: colors.glslDark,
        colorBackground: colors.glslLight,
        displayThreshold: radiatingCoastlineDisplayThreshold,
      }),
      attributes: Object.assign({}, geoRenderShaders.lineFill.attributes, {
        radiatingCoastlineBufferIndex: map.prop('radiatingCoastlineBufferIndex'),
        radiatingCoastlineBufferDistance: map.prop('radiatingCoastlineBufferDistance'),
      }),
      vert: glsl`
        precision highp float;
        #pragma glslify: Line = require('glsl-georender-style-texture/line.h');
        #pragma glslify: readLine = require('glsl-georender-style-texture/line.glsl');
        attribute vec2 position, normal, dist;
        attribute float featureType, index;
        attribute float radiatingCoastlineBufferIndex, radiatingCoastlineBufferDistance;
        uniform vec4 viewbox;
        uniform vec2 offset, size;
        uniform float displayThreshold, featureCount, aspect, zoom;
        uniform sampler2D styleTexture;
        varying float vft, vindex, zindex, vdashLength, vdashGap, vDisplay;
        varying vec2 vpos, vnorm, vdist;
        varying vec4 vcolor;
        varying float vRadiatingCoastlineBufferIndex, vRadiatingCoastlineBufferDistance;
        varying vec2 vPosLonLat;
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
          vPosLonLat = position;

          float third = mod(radiatingCoastlineBufferIndex, 0.3);
          float display = step(displayThreshold, third);
          vDisplay = display;
        }
      `,
      frag: glsl`
        precision highp float;

        #pragma glslify: lonLatToSphere = require('../util/lon-lat-to-sphere.glsl')
        #pragma glslify: random = require('glsl-random')

        uniform vec4 viewbox;
        uniform vec2 size;
        uniform float aspect;
        uniform float tick;
        uniform vec3 lightPosition;
        uniform vec4 colorForeground, colorBackground;
        varying float vdashLength, vdashGap;
        varying vec2 vdist;
        varying vec4 vcolor;
        varying vec2 vpos;
        varying vec2 vPosLonLat;
        varying float vDisplay, vRadiatingCoastlineBufferIndex, vRadiatingCoastlineBufferDistance;

        void main () {
          vec3 positionSphere = lonLatToSphere(vPosLonLat);
          vec3 lightDirectionSphere = normalize(lightPosition - positionSphere);
          float dotSphereLight = dot(positionSphere, lightDirectionSphere);
          vec2 vb = vec2(viewbox.z-viewbox.x, viewbox.w-viewbox.y);
          vec2 s = vec2(size.x, size.y*aspect);
          float t = length(vdist*s/vb);
          float d = vdashLength;
          float g = vdashGap;
          float x = 1.0 - step(d, mod(t, d+g));
          float tt = 1.0 - (
            sin(
              (tick * 0.1 + vRadiatingCoastlineBufferIndex * 40.0 +
                vpos.x * vpos.y * 80.0 +
                mod(t, 20.0) * 4.0
              )/18.0
            ) * 0.5 + 0.5);

          float hasLight = step(0.0, dotSphereLight);
          vec3 colorHsluv = mix(colorBackground.xyz, colorForeground.xyz, hasLight);
          vec3 color = colorHsluv.xyz;
          float opacity = mix(0.0, vcolor.w * x * tt, vDisplay);
          gl_FragColor = vec4(color.xyz, opacity);
          //gl_FragColor = vec4(mix(vec3(0,1,0), vec3(1,0,0), x), 1.0);
        }
      `,
    })
  }

  const oceanShader = {
    attributes: {
      position: [
        -180, -90,
        -180, 90,
        180, 90,
        180, -90,
      ],
    },
    elements: [
      0, 1, 2,
      1, 2, 3
    ],
    uniforms: {
      viewbox: map.prop('viewbox'),
      offset: map.prop('offset'),
      aspect: function (context) {
        return context.viewportWidth / context.viewportHeight
      },
      zindex: 0.1,
      colorBackground: colors.glslLight,
      colorForeground: colors.glslDark,
      lightPosition: () => globalContext.lightPosition,
      lightTransitionBuffer: globalContext.lightTransitionBuffer,
    },
    blend: {
      enable: true,
      func: { src: 'src alpha', dst: 'one minus src alpha' },
    },
    vert: `
      precision highp float;

      attribute vec2 position;
      uniform vec4 viewbox;
      uniform vec2 offset;
      uniform float aspect, zindex;
      varying vec2 vPosLonLat;

      void main () {
        vec2 p = position.xy + offset;
        gl_Position = vec4(
          (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
          ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
          1.0/(1.0+zindex), 1);
        vPosLonLat = position;
      }
    `,
    frag: glsl`
      precision highp float;

      uniform vec4 colorForeground, colorBackground;
      uniform vec3 lightPosition;
      uniform float lightTransitionBuffer;
      varying vec2 vPosLonLat;

      #pragma glslify: lonLatToSphere = require('../util/lon-lat-to-sphere.glsl')
      #pragma glslify: random = require('glsl-random')

      void main () {
        vec3 positionSphere = lonLatToSphere(vPosLonLat);
        vec3 lightDirectionSphere = normalize(lightPosition - positionSphere);
        float dotSphereLight = dot(positionSphere, lightDirectionSphere); 

        // hidden threashold of
        // 0 means color is fully on
        // 1 means color is fully off
        // we have a primary color, which we want to be fully on
        float hiddenThreshold = smoothstep(-lightTransitionBuffer, lightTransitionBuffer, dotSphereLight);

        vec3 color = colorForeground.xyz;
        if (dotSphereLight > lightTransitionBuffer) {
          color = colorBackground.xyz;
        }
        else {
          float randomThreshold = sqrt(random(vec2(random(vPosLonLat.xy), vPosLonLat.yx)));  
            if (randomThreshold < hiddenThreshold) {
            color = colorBackground.xyz;
          }
        }
        gl_FragColor = vec4(color.xyz, 1.0);
      }
    `,
  }

  const cityShader = {
    attributes: {
      position: map.prop('positions'),
      anchor: map.prop('anchors'),
      population: map.prop('population'),
      index: map.prop('index'),
      highlight: map.prop('highlight'),
    },
    elements: map.prop('cells'),
    uniforms: {
      zindex: 10,
      dimensions: map.prop('dimensions'),
      maxPopulation: map.prop('maxPopulation'),
      selectCity,
      colorLights: colors.glslLight,
      tick: ({ tick }) => {
        return tick
      },
      lightPosition: () => globalContext.lightPosition,
      lightTransitionBuffer: globalContext.lightTransitionBuffer,
    },
    blend: {
      enable: true,
      func: { src: 'src alpha', dst: 'one minus src alpha' },
    },
    depth: {
      enable: true,
      mask: false,
    },
    vert: `
      precision highp float;
      attribute vec2 position;
      attribute vec2 anchor, highlight;
      attribute float population, index;
      uniform vec4 viewbox;
      uniform vec2 offset;
      uniform float zindex, aspect;
      varying vec2 vpos;
      varying vec2 vanchor, vhighlight;
      varying float vpopulation, vindex;
      void main () {
        vec2 p = position + offset;
        gl_Position = vec4(
          (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
          ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
          1.0/(2.0+zindex), 1);
        vpos = position;
        vanchor = anchor;
        vpopulation = population;
        vindex = index;
        vhighlight = highlight;
      }
    `,
    frag: glsl`
      precision highp float;
      uniform vec2 dimensions;
      uniform vec4 colorLights;
      uniform float maxPopulation;
      uniform float tick;
      uniform float lightTransitionBuffer;
      uniform float selectCity;
      uniform vec3 lightPosition;
      varying vec2 vpos;
      varying vec2 vanchor;
      varying vec2 vhighlight;
      varying float vpopulation;

      #pragma glslify: random = require('glsl-random')
      #pragma glslify: lonLatToSphere = require('../util/lon-lat-to-sphere.glsl')

      void main () {
        vec3 positionSphere = lonLatToSphere(vpos);
        vec3 lightDirectionSphere = normalize(lightPosition - positionSphere);
        float dotSphereLight = dot(positionSphere, lightDirectionSphere);
        float dist = distance(vanchor, vpos);
        float radius = dimensions.x;
        float hiddenThreshold = clamp(dist/radius, 0.0, 1.0);
        float pop = clamp(vpopulation / maxPopulation, 0.0, 1.0);
        float popBaseRadius = mix(0.2, 0.4, pop);
        float popFluxFactor = mix(0.1, 0.12, pop);
        float popLightFactor = smoothstep(lightTransitionBuffer, -lightTransitionBuffer, dotSphereLight);
        float r = random(vpos.xy);
        float popFlux = sin((tick * 0.1 + r * 1000.0)/10.0) * popFluxFactor;

        float highlightDuration = 120.0;
        float highlightProgress = clamp((tick - vhighlight.x)/highlightDuration, 0.0, 1.0);
        // vhighlight.y = 0 when shrinking to 0
        // vhighlight.y = 1 when growing to 1
        float highlightFactor = mix(1.0 - highlightProgress, highlightProgress, vhighlight.y);
        float ackHighlightFactor = mix(1.0, highlightFactor, selectCity);

        float randomThreshold = sqrt(r) * 
          (popBaseRadius + popFlux) *
          popLightFactor *
          ackHighlightFactor;
        
        // opacity is 0 or 1
        // if (dotSphereLight > 0.0) = 1.0
        float isHiddenA = step(0.0, dotSphereLight);
        // if (hiddenThreshold > randomThreshold) = 1.0
        float isHiddenB = step(randomThreshold, hiddenThreshold);
        float isHidden = min(isHiddenA + isHiddenB, 1.0);
        float opacity = 1.0 - isHidden;

        gl_FragColor = vec4(colorLights.xyz, opacity);
      }
    `,
    pickFrag,
  }

  // terrain-img:start
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
      aspect: (context) => context.viewportWidth/context.viewportHeight,
      maxElevation: 1016.1,
      colorForeground: colors.glslDark,
      colorBackground: colors.glslLight,
      texelSize: (context, props) => {
        const width = props.texture.width
        const height = props.texture.height
        if (width && height) return [1/width, 1/height]
        return [0, 0]
      },
      lightPosition: () => globalContext.lightPosition,
      lightAmbientAmount: () => globalContext.lightAmbientAmount,
      lightTransitionBuffer: globalContext.lightTransitionBuffer,
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
      uniform float lightAmbientAmount, lightTransitionBuffer;

      varying vec2 vtcoord;
      varying vec2 vpos;
      varying vec2 vPosLonLat;

      const float minElevation = -900.0;
      
      #pragma glslify: random = require('glsl-random')
      #pragma glslify: lonLatToSphere = require('../util/lon-lat-to-sphere.glsl')

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

      void main () {
        float z = texelToElevation(texture2D(heightMap, vtcoord).xyz);
        float normalizedElevation = max(0.0, min(1.0, z / maxElevation));
        if (z < minElevation) {
          gl_FragColor = vec4(0.0);
          return;
        }
        vec3 positionSphere = lonLatToSphere(vPosLonLat);
        vec3 lightDirectionSphere = normalize(lightPosition - positionSphere);
        float dotSphereLight = dot(positionSphere, lightDirectionSphere);
        vec3 position = vec3(vpos, z);
        vec3 positionNormal = calculateNormal(vtcoord);
        // vec3 lightDirection = normalize(lightPosition - position);
        vec3 lightDirection = normalize(lightPosition - lonLatToSphere(position));
        float dotPositionLight = dot(positionNormal, lightDirection * vec3(-1., 1., 1.));
        float lightDiffuseAmount = max(dotPositionLight, 0.0);
        float lightAmount = clamp(lightAmbientAmount + lightDiffuseAmount, 0.0, 1.0);
        // hiddenThreshold
        // 0.0 = fully dadrk
        // 1.0 = full light
        // float hiddenThreshold = 1.0 - lightAmount;
        // float hiddenThreshold = 1.0 - (dotPositionLight * 0.5 + 0.5);
        float hiddenThreshold = 1.0 - mix(0.0, 0.4, normalizedElevation) - mix(0.0, 0.6, dotPositionLight * 0.5 + 0.5);
        if (dotSphereLight < -lightTransitionBuffer) {
          // dark
          hiddenThreshold = 0.0;
        }
        else if (dotSphereLight > -lightTransitionBuffer && dotSphereLight < lightTransitionBuffer) {
          // transition space
          // [-0.2, 0.2] => [0, 1] => [-1, 1]
          float transitionFactor = smoothstep(-lightTransitionBuffer, lightTransitionBuffer, dotSphereLight);
          // [0, 1] => [-1, 1]
          transitionFactor = transitionFactor * 2.0 - 1.0;
          hiddenThreshold = hiddenThreshold * (transitionFactor * 2.0 - 1.0) * 1.0 - 0.2;
        }
        float opacity = 1.0;
        // float opacity = min(1.0, normalizedElevation + 0.3);
        float randomThreshold = sqrt(random(position.xy));
        if (randomThreshold < hiddenThreshold) {
          opacity = 0.0;
        }
        // offset our elevation into a smaller range that prefers the foreground color
        // vec3 color = mix(colorForeground.xyz - vec3(0., 0., -30.0), colorForeground.xyz, normalizedElevation);
        vec3 color = colorForeground.xyz;
        // vec4 color = mix(colorBackground, colorForeground, 1.0);
        gl_FragColor = vec4(color.xyz, opacity);
      }
    `,
  }

  // terrain-img:end

  const coastlineShadowShader = Object.assign({}, geoRenderShaders.areas, {
    attributes: Object.assign({}, geoRenderShaders.areas.attributes, {
      elevation: map.prop('elevation'),
    }),
    uniforms: Object.assign({}, geoRenderShaders.areas.uniforms, {
      colorForeground: colors.glslDark,
      coastlineFade: params.coastlineFade,
      lightPosition: () => globalContext.lightPosition,
      lightTransitionBuffer: globalContext.lightTransitionBuffer,
    }),
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
      varying vec2 vPosLonLat;
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
        vPosLonLat = position;
      }
    `,
    frag: glsl`
      precision highp float;
      varying vec4 vcolor;
      varying vec2 vpos;
      varying float vElevation;
      varying vec2 vPosLonLat;

      uniform vec3 lightPosition;
      uniform float lightTransitionBuffer;
      uniform vec4 colorForeground;
      uniform float coastlineFade;

      #pragma glslify: lonLatToSphere = require('../util/lon-lat-to-sphere.glsl')
      #pragma glslify: random = require('glsl-random')

      void main () {
        vec3 positionSphere = lonLatToSphere(vPosLonLat);
        vec3 lightDirectionSphere = normalize(lightPosition - positionSphere);
        float dotSphereLight = dot(positionSphere, lightDirectionSphere);
        float normalizedElevation = 1.0 - (vElevation * 0.5 + 0.5);
        float clampedElevation = min(max(0.0, normalizedElevation), 1.0);
        float randomThreshold = sqrt(random(vec2(random(vpos.xy), vpos.yx)));
        float hiddenThreshold;

        // we don't really use this because the precision isn't great atm so maybe
        // we remove it? precision might be higher if we do our geoprocessing
        // (finding the coastline geometry)
        if (coastlineFade > 0.0) {
          hiddenThreshold = 1.2 - normalizedElevation;  
        }
        else {
          hiddenThreshold = 1.2 - random(vec2(vpos.x, normalizedElevation));
        }

        if (dotSphereLight < -lightTransitionBuffer) {
          // dark
          hiddenThreshold = 0.0;
        }
        else if (dotSphereLight > -lightTransitionBuffer && dotSphereLight < lightTransitionBuffer) {
          // transitioning
          float transitionFactor = smoothstep(-lightTransitionBuffer, lightTransitionBuffer, dotSphereLight);
          transitionFactor = transitionFactor * 2.0 - 1.0;
          hiddenThreshold = hiddenThreshold * transitionFactor * 1.0 - 0.2;
        }
        
        float opacity = 1.0;
        if (randomThreshold - 0.15 < hiddenThreshold) {
          opacity = 0.0;
        }
        vec3 color = colorForeground.xyz;
        gl_FragColor = vec4(color.xyz, opacity);
      }
    `,
  })

  function updateLightPositionForTick ({ tick }) {
    globalContext.lightPosition = lightPositionTick({ tick })
  }

  const drawCmds = {
    ocean: map.createDraw(oceanShader),
    coastlineShadow: map.createDraw(coastlineShadowShader),
    terrainImgTile: map.createDraw(terrainImgTileShader),
    radiatingCoastline: map.createDraw(includeAllTags ? geoRenderShadersTick.lineFill : geoRenderShaders.lineFill),
    city: map.createDraw(Object.assign({}, cityShader))
  }

  return {
    globalContext,
    updateLightPositionForTick,
    drawCmds,
  }
}

function spreadProps ({ map, draw, props }) {
  map.addLayer(props.terrainLayer({
    drawCmd: draw.terrainImgTile,
  }))

  setProps(draw.radiatingCoastline.props, props.lineP)
  setProps(draw.coastlineShadow.props, props.area)
  setProps(draw.city.props, props.city)

  draw.ocean.props = [{}]
}

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
