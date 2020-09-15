// Creates a new canvas
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// Accesses WebGL api through the webgl context
const gl = canvas.getContext('webgl');

// Creates the shaders on the graphic card
// and returns their handles
const vertexShader = gl.createShader(gl.VERTEX_SHADER);
const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

// Attach the source to the shader
gl.shaderSource(
    vertexShader,
    `
    attribute vec2 position;
    varying vec2 texCoord;

    void main() {
        // Since texture coordinates are from 0 to 1,
        // we need to normalize the values
        texCoord = (position + 1.0) / 2.0;
        texCoord.y = 1.0 - texCoord.y;

        // Sets the position of the current vertex to an interal variable
        gl_Position = vec4(position, 0.0, 1.0);
    }
`
);

// Attaches the source to the shader
gl.shaderSource(
    fragmentShader,
    `
    precision mediump float;

    varying vec2 texCoord;
    uniform sampler2D image;
    uniform float brightness;
    uniform float contrast;
    uniform float saturation;
    uniform float temperature;
    uniform float sharpness;
    uniform vec2 resolution;

    void main() {
        // Retrieves the color of the pixel at the given
        // coordinates from the image
        vec4 color = texture2D(image, texCoord);

        // Sharpness (unsharp mask)
        // guassian blur kernel
        mat3 kernel = mat3(
            1.0, 2.0, 1.0,
            2.0, 4.0, 2.0,
            1.0, 2.0, 1.0
        );
        vec3 blurred = vec3(0);

        // Compute guassian blur through convolution
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec2 coord = texCoord + vec2(float(x), float(y)) * resolution;
                blurred += texture2D(image, coord).rgb * kernel[y][x];
            }
        }
        blurred /= 16.0;

        // Applies unsharp mask
        color.rgb += (color.rgb - blurred) * sharpness * 2.0;

        // Temperature
        color.r += temperature;
        color.b -= temperature;

        // Brightness
        color.rgb += brightness;

        // Contrast
        color.rgb = (color.rgb - 0.5) * (contrast + 1.0) + 0.5;

        // Saturazione
        vec3 desaturatedColor = vec3((color.r + color.g + color.b) / 3.0);
        color.rgb = mix(desaturatedColor, color.rgb, (saturation + 1.0));

        // Sets the color of the current pixel by assigning it
        // to the internal variable gl_FragColor
        gl_FragColor = color;
    }
`
);

// Compiles the shaders
gl.compileShader(vertexShader);
gl.compileShader(fragmentShader);
// Checks whether there are compilation errors
if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(fragmentShader);
    throw 'Could not compile WebGL program. \n\n' + info;
}

// Create a new shader program and attaches
// the shaders to it
const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);

// Links the program object to made
// it available in the rendering process
gl.linkProgram(program);

// Tells WebGL to use our shader program
// during the rendering process
gl.useProgram(program);

// Defines the coordinates of the 2 trinagles
// required to draw a plane that fills the clip-space
const planeVertices = [-1, -1, -1, 1, 1, 1, 1, 1, -1, -1, 1, -1];

// Creates a new buffer
const vertexBuffer = gl.createBuffer();

// Binds the buffer to the Array Buffer
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

// Fills the buffer with the data.
// With STATIC_DRAW we say that those data will not change,
// so the graphic card will eventually optimize
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planeVertices), gl.STATIC_DRAW);

// Creates a new attribute in our program that will contain
// the position of each vertex
const positionLocation = gl.getAttribLocation(program, 'position');

// Enables the attribute
gl.enableVertexAttribArray(positionLocation);

// Binds the currently bounded buffer to our attribute
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

// Creates a new texture and returns its handle
const texture = gl.createTexture();

// Binds the texture to 2d texture target
gl.bindTexture(gl.TEXTURE_2D, texture);

// Sets the texture wrapping function
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

// Sets the texture magnification and minification filters
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

// Get the uniform identifier with which we can pass the image
const imageLocation = gl.getUniformLocation(program, 'image');

// Sets the identifier of the texture
gl.uniform1i(imageLocation, 0);

// Creates an object containing all the filters parameters
const uniforms = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    sharpness: 0,
};

const draw = requestAnimationFrame.bind(null, () => {
    // Sets the size of the viewport to fill the canvas
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    // Sets the clear color
    gl.clearColor(1, 0, 0, 1);

    // Clears the color buffer
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Sets the uniforms values
    for (const [name, value] of Object.entries(uniforms)) {
        const uniformLocation = gl.getUniformLocation(program, name);
        gl.uniform1f(uniformLocation, value);
    }

    // Sets the canvas normalized resolution
    gl.uniform2fv(
        gl.getUniformLocation(program, 'resolution'),
        new Float32Array([
            1 / gl.drawingBufferWidth,
            1 / gl.drawingBufferHeight,
        ])
    );

    // Draw the buffer array on the screen
    gl.drawArrays(gl.TRIANGLES, 0, 6);
});

// Set-ups the GUI
const gui = new Tweakpane();
for (const name of Object.keys(uniforms)) {
    gui.addInput(uniforms, name, {
        min: -1,
        max: 1,
        step: 0.01,
    });
}
gui.on('change', draw);

const image = new Image();
image.onload = () => {
    // Sets the canvas size to reflect the natural size of the image
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // Uploads the image on the card in the bounded texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    draw();
};
// Loads the image (NOTE: must be same-origin)
image.src = 'image.jpg';
