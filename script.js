let scene, camera, renderer;
const models = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const previousMouse = new THREE.Vector2();
let selectedModel = null;
let isDragging = false;
const rotationSpeeds = [];
const MOVE_SPEED = 0.1;
const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};
let pointLights = [];
const clock = new THREE.Clock();
const velocity = new THREE.Vector3(0, 0, 0);
const maxSpeed = 0.2;
const acceleration = 0.008;
const friction = 0.96;
const verticalVelocity = new THREE.Vector3(0, 0, 0);
const verticalAcceleration = 0.05;
const tiltIntensity = 0.3;  // Controls how much the camera tilts during movement
const spinVelocities = new Map(); // Store spin velocities for each model
const spinFriction = 0.97;        // How quickly the spin slows down
const spinSensitivity = 0.05;     // How much drag converts to spin
let lastMouseX = 0;
let lastMouseY = 0;
let isAlternateMovement = true;  // true = Style 1 (up/down with W/S)
const modelLights = new Map(); // Store lights for each model
const LIGHT_COLOR = 0x66ccff;  // Light blue color
const LIGHT_INTENSITY = 0.25;   // 50% intensity

function init() {
    // Create scene
    scene = new THREE.Scene();
    
    // Setup camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = 10;

    // Setup renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);

    // Basic lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Load Models in a grid
    const loader = new THREE.GLTFLoader();
    
    function loadModelsInGrid(modelFiles) {
        const numModels = modelFiles.length;
        const columns = Math.ceil(Math.sqrt(numModels));
        const rows = Math.ceil(numModels / columns);
        const spacing = 4;

        // Calculate grid dimensions
        const gridWidth = columns * spacing;
        const gridHeight = rows * spacing;

        // Create area light that covers the grid
        const areaLight = new THREE.RectAreaLight(
            0xffffff,  // color
            2,         // intensity
            gridWidth * 1.5,  // width (1.5x grid size for better coverage)
            gridHeight * 1.5  // height (1.5x grid size for better coverage)
        );
        areaLight.position.set(0, 0, 5); // Position in front of grid
        areaLight.lookAt(0, 0, 0);
        scene.add(areaLight);

        modelFiles.forEach((file, i) => {
            const row = Math.floor(i / columns);
            const col = i % columns;
            
            loader.load(
                `models/${file}`,
                function (gltf) {
                    const model = gltf.scene;
                    
                    // Center and scale the model
                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scale = 1.5 / maxDim;
                    
                    model.scale.multiplyScalar(scale);
                    model.position.sub(center.multiplyScalar(scale));
                    
                    // Position in grid
                    model.position.x = (col - columns/2 + 0.5) * spacing;
                    model.position.y = -(row - rows/2 + 0.5) * spacing;
                    
                    // Initial rotation
                    model.rotation.y = -Math.PI / 2;
                    
                    // Add random rotation speed
                    const rotationSpeed = 0.001 + Math.random() * 0.002;
                    rotationSpeeds.push(rotationSpeed);
                    
                    // Add static light blue point light
                    const light = new THREE.PointLight(
                        LIGHT_COLOR,
                        LIGHT_INTENSITY,
                        10
                    );
                    light.position.set(
                        model.position.x,
                        model.position.y,
                        model.position.z + 2
                    );
                    scene.add(light);
                    modelLights.set(model, light);

                    scene.add(model);
                    models.push(model);
                    
                    model.userData = {
                        baseScale: scale,
                        rotationSpeed: rotationSpeed
                    };
                }
            );
        });
    }

    // Fetch list of GLB files from the models directory
    fetch('models/')
        .then(response => response.text())
        .then(data => {
            // Parse the directory listing to find .glb files
            const parser = new DOMParser();
            const doc = parser.parseFromString(data, 'text/html');
            const files = Array.from(doc.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => href.endsWith('.glb'))
                .map(href => href.split('/').pop());
            
            loadModelsInGrid(files);
        })
        .catch(error => {
            console.error('Error loading models:', error);
        });

    // Event listeners
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('mousedown', onMouseDown, false);
    window.addEventListener('mouseup', onMouseUp, false);
    initControls();
}

function onMouseDown(event) {
    event.preventDefault();
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    isDragging = true;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(models, true);
    
    if (intersects.length > 0) {
        selectedModel = intersects[0].object.parent;
        isDragging = true;
        previousMouse.x = event.clientX;
        previousMouse.y = event.clientY;
    }
}

function onMouseUp(event) {
    isDragging = false;
    selectedModel = null;
}

function onMouseMove(event) {
    if (isDragging && selectedModel) {
        event.preventDefault();
        
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        const deltaX = event.clientX - lastMouseX;
        const deltaY = event.clientY - lastMouseY;
        
        selectedModel.rotation.y += deltaX * 0.01;
        selectedModel.rotation.x += deltaY * 0.01;
        
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;

        // Store the spin velocity for this model
        if (!spinVelocities.has(selectedModel)) {
            spinVelocities.set(selectedModel, { x: 0, y: 0 });
        }
        
        // Update spin velocity based on mouse movement
        const spin = spinVelocities.get(selectedModel);
        spin.x = deltaY * spinSensitivity;
        spin.y = deltaX * spinSensitivity;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function initControls() {
    window.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        if (keys.hasOwnProperty(key)) {
            keys[key] = true;
        }
    });

    window.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        if (keys.hasOwnProperty(key)) {
            keys[key] = false;
        }
    });
}

function handleKeyMovement() {
    const targetVelocity = new THREE.Vector3(0, 0, 0);
    
    if (isAlternateMovement) {
        // Alternate style: W/S for up/down
        if (keys.w) targetVelocity.y = 1;
        if (keys.s) targetVelocity.y = -1;
        if (keys.a) targetVelocity.x = -1;
        if (keys.d) targetVelocity.x = 1;
    } else {
        // Original style: W/S for forward/back
        if (keys.w) targetVelocity.z = -1;
        if (keys.s) targetVelocity.z = 1;
        if (keys.a) targetVelocity.x = -1;
        if (keys.d) targetVelocity.x = 1;
    }

    if (targetVelocity.length() > 0) {
        targetVelocity.normalize();
        velocity.x += (targetVelocity.x * acceleration);
        if (isAlternateMovement) {
            velocity.y += (targetVelocity.y * acceleration);
        } else {
            velocity.z += (targetVelocity.z * acceleration);
        }
    }

    // Apply friction
    velocity.multiplyScalar(friction);
    if (!isAlternateMovement) {
        verticalVelocity.multiplyScalar(friction);
    }

    // Limit speeds
    if (velocity.length() > maxSpeed) {
        velocity.normalize();
        velocity.multiplyScalar(maxSpeed);
    }
    if (!isAlternateMovement && Math.abs(verticalVelocity.y) > maxSpeed) {
        verticalVelocity.y = Math.sign(verticalVelocity.y) * maxSpeed;
    }

    // Apply velocities
    camera.position.add(velocity);
    if (!isAlternateMovement) {
        camera.position.add(verticalVelocity);
    }

    // Camera tilt (now works in both modes)
    camera.rotation.z = -velocity.x * tiltIntensity;
    if (isAlternateMovement) {
        camera.rotation.x = -velocity.y * tiltIntensity; // Tilt based on vertical movement
    } else {
        camera.rotation.x = velocity.z * tiltIntensity;  // Tilt based on forward movement
    }
    
    // Smooth return to level when not moving
    if (targetVelocity.length() === 0) {
        camera.rotation.z *= 0.95;
        camera.rotation.x *= 0.95;
    }
}

function animate() {
    requestAnimationFrame(animate);
    handleKeyMovement();

    // Update models
    models.forEach((model, index) => {
        if (!isDragging || model !== selectedModel) {
            model.rotation.y += model.userData.rotationSpeed;
        }
    });

    // Update light positions to stay with models
    modelLights.forEach((light, model) => {
        light.position.set(
            model.position.x,
            model.position.y,
            model.position.z + 2
        );
    });

    // Update spins
    spinVelocities.forEach((spin, model) => {
        if (!isDragging || model !== selectedModel) {
            // Apply spin with friction
            model.rotation.x += spin.x;
            model.rotation.y += spin.y;
            
            // Apply friction
            spin.x *= spinFriction;
            spin.y *= spinFriction;
            
            // Stop very small spins to prevent endless tiny rotations
            if (Math.abs(spin.x) < 0.0001) spin.x = 0;
            if (Math.abs(spin.y) < 0.0001) spin.y = 0;
        }
    });

    renderer.render(scene, camera);
}

// Initialize and start animation
document.addEventListener('DOMContentLoaded', () => {
    init();
    animate();

    // Add to global variables
    isAlternateMovement = true;

    // Wrap button initialization in DOMContentLoaded
    const toggleButton = document.getElementById('moveStyleToggle');
    toggleButton.textContent = "Movement Style 1: Scanner";  // Initial text
    
    toggleButton.addEventListener('click', () => {
        isAlternateMovement = !isAlternateMovement;
        toggleButton.textContent = isAlternateMovement 
            ? "Movement Style 1: Scanner" 
            : "Movement Style 2: Racer";
    });
});

// Add wheel event listener
document.addEventListener('wheel', (event) => {
    event.preventDefault();
    
    if (isAlternateMovement) {
        // Scroll controls forward/backward
        const delta = event.deltaY || event.detail || event.wheelDelta;
        velocity.z += Math.sign(delta) * verticalAcceleration;
    } else {
        // Original style: scroll controls up/down
        const delta = event.deltaY || event.detail || event.wheelDelta;
        verticalVelocity.y += -Math.sign(delta) * verticalAcceleration;
    }
}, { passive: false });

