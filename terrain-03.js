// terrain-03
// shade based on angle?
const regl = require('regl')()
const resl = require('resl')
const getPixels = require('get-pixels')
const angleNormals = require('angle-normals')

const draw = {
  points: drawPoints(),
  cells: drawCells(),
}

getPixels('terrain-rgb/9-161-229.pngraw', onPixels)

async function onPixels (error, pixels) {
  if (error) return console.log(error)

  const sampleRate = 32
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

  regl.clear({
    color: [0.5,0.5,0.5,1.0],
  })

  // draw.points({
  //   positions,
  //   sampleRate,
  //   maxElevation,
  //   count: positions.length,
  // })
  draw.cells({
    positions: nPositions,
    sampleRate,
    maxElevation,
    cells: nCells,
    normals,
  })
}

function drawPoints () {
  return regl({
    vert: `
      precision highp float;
      
      attribute vec3 position;
      uniform float sampleRate;
      uniform vec2 viewport;
      varying float elevation;

      void main () {
        vec2 p = (position.xy/sampleRate) * 2.0 - 1.0;
        gl_PointSize = 10.0;
        gl_Position = vec4(p + 40./viewport, 0.0, 1.0);
        elevation = position.z;
      }
    `,
    frag: `
      precision highp float;

      uniform float maxElevation;

      varying float elevation;

      const vec3 blue = vec3(0,0,1);
      const vec3 green = vec3(0,1,0);

      void main () {
        vec3 color = mix(
          blue,
          green,
          elevation/maxElevation
        );
        gl_FragColor = vec4(color, 1 );
      }
    `,
    attributes: {
      position: regl.prop('positions'),  
    },
    uniforms: {
      sampleRate: regl.prop('sampleRate'),
      maxElevation: regl.prop('maxElevation'),
      viewport: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
    },
    primitive: 'points',
    count: regl.prop('count'),
  })
}

function drawCells () {
  return regl({
    vert: `
      precision highp float;
      
      attribute vec4 position;
      attribute vec3 normal;
      uniform float sampleRate;
      uniform vec2 viewport;

      varying vec4 vPosition;
      varying vec3 vNormal;

      void main () {
        vec2 p = (position.xy/sampleRate) * 2.0 - 1.0;
        gl_Position = vec4(p + 40./viewport, 0.0, 1.0);
        vPosition = position;
        vNormal = normal;
      }
    `,
    frag: `
      precision highp float;

      uniform float maxElevation;

      varying vec4 vPosition;
      varying vec3 vNormal;

      const vec3 lightSource = vec3(0, 1, 0);

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
    },
    elements: regl.prop('cells'),
  })
}
