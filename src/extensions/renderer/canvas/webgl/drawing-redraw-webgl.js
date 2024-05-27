const CRp = {};

CRp.initWebgl = function(options) {
  const r = this;

  const gl = r.data.contexts[r.WEBGL];
  gl.clearColor(0, 0, 0, 0); // background color

  const nodeProgram = createNodeShaderProgram(gl);
  const edgeProgram = createEdgeShaderProgram(gl);

  r.data.webgl = { 
    nodeProgram,
    edgeProgram,
    needBuffer: true,
  };
}


function createVertexArrays(eles) {
  const nodeVertexArray = [];
  const nodeColorArray = [];
  const edgeVertexArray = [];
  let nodeCount = 0;
  let edgeCount = 0;

  // TODO need to add Z coord so that ordering is correct?
  // Or maybe just drawing them in order will do the trick?
  // No,,, vertex shaders run in parallel
  for(let i = 0; i < eles.length; i++) {
    const ele = eles[i];
    if(ele.isNode()) {
      const node = ele;

      const bgcolor = node.pstyle('background-color').value;
      const opacity = node.pstyle('opacity').value;
      const [ r, g, b, a ] = [ bgcolor[0]/256, bgcolor[1]/256, bgcolor[2]/256, opacity ];

      const pos = node.position();
      const padding = node.padding();
      const nodeWidth = node.width() + 2 * padding;
      const nodeHeight = node.height() + 2 * padding;
      const halfW = nodeWidth / 2;
      const halfH = nodeHeight / 2;
      
      const topY = pos.y + halfH;
      const botY = pos.y - halfH;
      const leftX = pos.x - halfW;
      const rightX = pos.x + halfW;
  
      // 6 vertices per node (for now)
      nodeVertexArray.push(
        leftX, botY,
        rightX, botY,
        rightX, topY,
        leftX, botY,
        rightX, topY,
        leftX, topY,
      );

      // TODO this is not optimal, but we will be using textures eventually so this will dissapear
      nodeColorArray.push(
        r, g, b,
        r, g, b,
        r, g, b,
        r, g, b,
        r, g, b,
        r, g, b,
      );

      nodeCount++;
      // z++;

    } else {
      const edge = ele;
      const sp = edge.source().position();
      const tp = edge.target().position();

      edgeVertexArray.push(
        sp.x, sp.y,
        tp.x, tp.y,
      );
      
      edgeCount++;
    }
  }

  return {
    nodeVertexArray,
    nodeColorArray,
    nodeCount,
    edgeVertexArray,
    edgeCount,
  }
}


function getEffectivePanZoom(r) {
  const zoom = r.cy.zoom();
  const pan  = r.cy.pan();
  return {
    zoom: zoom * r.pixelRatio,
    x: pan.x * r.pixelRatio,
    y: pan.y * r.pixelRatio,
  };
}


function createMatrices(r) {

  function getTransformMatrix4x4() {
    const panzoom = getEffectivePanZoom(r);
    const mat = new Array(16).fill(0);
    mat[0] = panzoom.zoom;
    mat[5] = panzoom.zoom;
    mat[10] = 1;
    mat[12] = panzoom.x;
    mat[13] = panzoom.y;
    mat[15] = 1;
    return mat;
  }

  function getTransformMatrix3x3() {
    const panzoom = getEffectivePanZoom(r);
    const mat = new Array(9).fill(0);
    mat[0] = panzoom.zoom;
    mat[4] = panzoom.zoom;
    mat[6] = panzoom.x;
    mat[7] = panzoom.y;
    mat[8] = 1;
    return mat;
  }

  function getProjectionMatrix4x4() {
    // maps the canvas space into clip space
    const width  = r.canvasWidth;
    const height = r.canvasHeight;
    const near = -10;
    const far = 10; // TODO set near/far to reasonable values that can show all z-indicies
    
    const lr = 1 / (0 - width);
    const bt = 1 / (height - 0);
    const nf = 1 / (near - far);
  
    const mat = new Array(16).fill(0);
    mat[0] = -2 * lr;
    mat[5] = -2 * bt;
    mat[10] = 2 * nf;
    mat[12] = (0 + width) * lr;
    mat[13] = (0 + height) * bt;
    mat[14] = (far + near) * nf;
    mat[15] = 1;
    return mat;
  }

  function getProjectionMatrix3x3() {
    // maps the canvas space into clip space
    const width  = r.canvasWidth;
    const height = r.canvasHeight;
    const mat = new Array(9).fill(0);
    mat[0] = 2 / width;
    mat[4] = -2 / height;
    mat[6] = -1;
    mat[7] = 1;
    mat[8] = 1;
    return mat;
  }

  const transformMatrix  = getTransformMatrix3x3();
  const projectionMatrix = getProjectionMatrix3x3();

  return {
    transformMatrix,
    projectionMatrix
  };
}


function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  console.log(gl.getShaderInfoLog(shader));
  return shader;
}

function createProgram(gl, vertexSource, fragementSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragementSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Could not initialize shaders');
  }
  return program;
}

function createNodeShaderProgram(gl) {
  const vertexShaderSource = `#version 300 es
    precision highp float;

    uniform mat3 uTransformMatrix;
    uniform mat3 uProjectionMatrix;

    in vec2 aVertexPosition;
    in vec3 aVertexColor;

    out vec4 vVertexColor;

    void main(void) {
      vVertexColor = vec4(aVertexColor, 1.0);
      gl_Position  = vec4(uProjectionMatrix * uTransformMatrix * vec3(aVertexPosition, 1.0), 1.0);
    }
  `;

  const fragmentShaderSource = `#version 300 es
    precision highp float;

    in vec4 vVertexColor;
    out vec4 fragColor;

    void main(void) {
      fragColor = vVertexColor;
    }
  `;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  program.aVertexPosition   = gl.getAttribLocation(program,  'aVertexPosition');
  program.aVertexColor      = gl.getAttribLocation(program,  'aVertexColor');
  program.uTransformMatrix  = gl.getUniformLocation(program, 'uTransformMatrix');
  program.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');

  return program;
}


function createEdgeShaderProgram(gl) {
  const vertexShaderSource = `#version 300 es
    precision highp float;

    uniform mat3 uTransformMatrix;
    uniform mat3 uProjectionMatrix;

    in vec2 aVertexPosition;
    // in vec3 aVertexColor;

    out vec4 vVertexColor;

    void main(void) {
      // vVertexColor = vec4(aVertexColor, 1.0);
      vVertexColor = vec4(0.0, 1.0, 0.0, 1.0);
      gl_Position  = vec4(uProjectionMatrix * uTransformMatrix * vec3(aVertexPosition, 1.0), 1.0);
    }
  `;

  const fragmentShaderSource = `#version 300 es
    precision highp float;

    in vec4 vVertexColor;
    out vec4 fragColor;

    void main(void) {
      fragColor = vVertexColor;
    }
  `;

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  program.aVertexPosition   = gl.getAttribLocation(program,  'aVertexPosition');
  // program.aVertexColor      = gl.getAttribLocation(program,  'aVertexColor');
  program.uTransformMatrix  = gl.getUniformLocation(program, 'uTransformMatrix');
  program.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');

  return program;
}


function bufferNodeData(gl, program, vertices) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  
  { // positions
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices.nodeVertexArray), gl.STATIC_DRAW);
    gl.vertexAttribPointer(program.aVertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.aVertexPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  { // colors
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices.nodeColorArray), gl.STATIC_DRAW);
    gl.vertexAttribPointer(program.aVertexColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.aVertexColor);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  gl.bindVertexArray(null);
  vao.count = vertices.nodeCount * 6;
  return vao;
}

function bufferEdgeData(gl, program, vertices) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices.edgeVertexArray), gl.STATIC_DRAW);
  gl.vertexAttribPointer(program.aVertexPosition, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(program.aVertexPosition);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  gl.bindVertexArray(null);
  vao.count = vertices.edgeCount * 2;
  return vao;
}


function drawSelectionRectangle(r, options) {
  function setContextTransform(context) {
    const w = r.canvasWidth;
    const h = r.canvasHeight;
    const panzoom = getEffectivePanZoom(r);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, w, h);
    context.translate(panzoom.x, panzoom.y);
    context.scale(panzoom.zoom, panzoom.zoom);
  }
  r.drawSelectionRectangle(options, setContextTransform);
}


CRp.renderWebgl = function(options) {
  const r = this;
  console.log('webgl render');
  
  if(r.data.canvasNeedsRedraw[r.SELECT_BOX]) {
    drawSelectionRectangle(r, options);
  }

  /** @type {WebGLRenderingContext} gl */
  const gl = r.data.contexts[r.WEBGL];
  const nodeProgram = r.data.webgl.nodeProgram;
  const edgeProgram = r.data.webgl.edgeProgram;

  if(r.data.webgl.needBuffer) {
    const eles = r.getCachedZSortedEles(); 
    const vertices = createVertexArrays(eles);
    r.nodeVAO = bufferNodeData(gl, nodeProgram, vertices);
    r.edgeVAO = bufferEdgeData(gl, edgeProgram, vertices);
    r.data.webgl.needBuffer = false;
  }

  if(r.data.canvasNeedsRedraw[r.NODE]) {
    const matrices = createMatrices(r);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    { // EDGES
      gl.bindVertexArray(r.edgeVAO);
      gl.useProgram(edgeProgram);
      gl.uniformMatrix3fv(edgeProgram.uTransformMatrix,  false, matrices.transformMatrix);
      gl.uniformMatrix3fv(edgeProgram.uProjectionMatrix, false, matrices.projectionMatrix);
      gl.drawArrays(gl.LINES, 0, r.edgeVAO.count);
      gl.bindVertexArray(null);
    }
    { // Nodes
      gl.bindVertexArray(r.nodeVAO);
      gl.useProgram(nodeProgram);
      gl.uniformMatrix3fv(nodeProgram.uTransformMatrix,  false, matrices.transformMatrix);
      gl.uniformMatrix3fv(nodeProgram.uProjectionMatrix, false, matrices.projectionMatrix);
      gl.drawArrays(gl.TRIANGLES, 0, r.nodeVAO.count);
      gl.bindVertexArray(null);
    }
  }
};

export default CRp;
