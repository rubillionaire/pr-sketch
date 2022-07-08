// terrain-06
// light source rocks back and forth
// elevation rises and flattens. could be a fun mode shift
// for a map. you want it all lumpy when you want to see
// how steep things are. flat when the elevation doesn't matter?
// probably better to just consider one at a time per the kind of map
// this is nice though.
// for now, we can rotate the whole thing too
const regl = require('regl')()
const resl = require('resl')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const getPixels = require('get-pixels')
const angleNormals = require('angle-normals')

const draw = {
  cells: drawCells(),
}

const processPixels = ({ sampleRate, pixels }) => {
  const { positions, maxElevation } = (({ pixels, sampleRate }) => {
    const positions = []
    const imgSize = pixels.shape
    let maxElevation = 0;
    for (let i = 0; i < sampleRate; i++) {
      for (let j = 0; j < sampleRate; j++) {
        const x = imgSize[0] / sampleRate * i
        const y = imgSize[1] / sampleRate * j
        const r = pixels.get(x, y, 0)
        const g = pixels.get(x, y, 1)
        const b = pixels.get(x, y, 2)
        // height based on mapbox terrain tile
        const z = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
        maxElevation = Math.max(maxElevation, z)
        positions.push([i, j, z])
      }
    }
    return {
      positions,
      maxElevation,
    }
  })({ pixels, sampleRate })

  // cells:start
  const cells = (({ sampleRate }) => {
    const cells = []
    const dim =  sampleRate - 1
    // loop through all positions, except the last row
    for (let i = 0; i < sampleRate * sampleRate; i++) {
      const x = i % sampleRate
      const y = Math.floor(i / sampleRate)
      // do not wrap on the edges
      if (x === dim) continue
      if (y === dim) continue
      cells.push([i, i + 1, i + sampleRate])
      cells.push([i + 1, i + sampleRate + 1, i + sampleRate])
    }
    return cells
  })({ sampleRate })

  // n-prefix for the new positions and cells that are created so that
  // each set of positions also includes a w/a value that corresponds
  // to the elevation of the triangle. then push this unique set of
  // positions into nPositions, and add their indicies to nCells
  const { nPositions, nCells } = (({ positions, cells }) => {
    let nPositions = []
    const nCells = []
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      let cellMaxElevation = 0
      for (let j = 0; j < cell.length; j++) {
        const z = positions[cell[j]][2]
        cellMaxElevation = Math.max(z, cellMaxElevation)
        // cellMaxElevation += z
      }
      // cellMaxElevation/=3
      // add next 3 indicies as the next cell
      nCells.push([nPositions.length, nPositions.length + 1, nPositions.length + 2])
      // push the positions with their w/a value as the cell max elevation
      nPositions = nPositions.concat(cell.map(c => positions[c].concat([cellMaxElevation])))
    }
    return {
      nPositions,
      nCells,
    }  
  })({ positions, cells })
  
  const normals = angleNormals(nCells, nPositions)

  return {
    maxElevation,
    nPositions,
    nCells,
    normals,
  }
}

getPixels('terrain-rgb/9-161-229.pngraw', onPixels)

async function onPixels (error, pixels) {
  if (error) return console.log(error)

  const sampleRate = 32
  const {
    nPositions,
    nCells,
    normals,
    maxElevation,
  } = processPixels({ sampleRate, pixels })


  regl.frame(({ tick }) => {
    regl.clear({
      color: [0.5,0.5,0.5,1.0],
    })
    
    draw.cells({
      positions: nPositions,
      sampleRate,
      maxElevation,
      cells: nCells,
      normals,
    })
  })
}

function drawCells () {

  // camera state
  const cameraProjectionMatrix = new Float32Array(16)
  const cameraViewMatrix = new Float32Array(16)

  let cameraViewEye = [0.0, -1.2, 2.4]
  let cameraViewCenter = [0.0, 0.0, 0.0,]
  let cameraViewUp = [0.0, 0.0, 1.0]

  return regl({
    vert: `
      precision highp float;
      
      attribute vec4 position;
      attribute vec3 normal;
      uniform float sampleRate;
      uniform vec2 viewport;
      uniform mat4 projection;
      uniform mat4 view;
      uniform float tick;

      varying vec4 vPosition;
      varying vec3 vNormal;

      void main () {
        vec2 p = (position.xy/sampleRate) * 2.0 - 1.0;
        vec2 offset = 40./viewport;
        float elevation = position.z/3000. * (cos(tick/50.) * 0.5 + 0.5);
        gl_Position = projection * view * vec4(p + offset, elevation, 1.0);
        vPosition = position;
        vNormal = normal;
      }
    `,
    frag: `
      precision highp float;

      uniform float maxElevation;
      uniform vec3 lightSource;

      varying vec4 vPosition;
      varying vec3 vNormal;

      // const vec3 lightSource = vec3(0, 1, 2);

      const vec3 blue = vec3(0,0,1);
      const vec3 green = vec3(0,1,0);

      void main () {
        vec3 normal = normalize(vNormal);
        vec3 elevationColor = mix(
          blue,
          green,
          vPosition.w/maxElevation
        );
        float lightAlignment = max(0.0, dot(lightSource, normal));
        vec3 lightColor = elevationColor - ((1.0 - lightAlignment) * vec3(0.2));
        gl_FragColor = vec4(lightColor, 1);
        // gl_FragColor = vec4(elevationColor, 1);
      }
    `,
    attributes: {
      position: regl.prop('positions'),
      normal: regl.prop('normals'),
    },
    uniforms: {
      sampleRate: regl.prop('sampleRate'),
      maxElevation: regl.prop('maxElevation'),
      viewport: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
      projection: ({viewportWidth, viewportHeight}) => {
        return mat4.perspective(
          cameraProjectionMatrix,
          Math.PI / 4,
          viewportWidth / viewportHeight,
          0.01,
          1000.0
        )
      },
      view: ({ tick }) => {

        vec3.rotateZ(cameraViewEye, cameraViewEye, cameraViewCenter, 0.003)

        return mat4.lookAt(
          cameraViewMatrix,
          cameraViewEye,
          cameraViewCenter,
          cameraViewUp
        )
      },
      lightSource: ({ tick }) => {
        return [
          0,
          Math.sin(tick/100) * 0.5 + 0.5,
          2,
        ]
      },
      tick: ({ tick }) => tick,
    },
    elements: regl.prop('cells'),
  })
}
