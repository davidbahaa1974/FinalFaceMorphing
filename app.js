/**
 * Face Morph Pro - Web Application
 * Real-time face morphing using MediaPipe and Canvas
 */

class FaceMorphApp {
    constructor() {
        // DOM Elements
        this.video = document.getElementById('video');
        this.outputCanvas = document.getElementById('outputCanvas');
        this.processingCanvas = document.getElementById('processingCanvas');
        this.thumbnailGrid = document.getElementById('thumbnailGrid');
        this.mobileThumbnailStrip = document.getElementById('mobileThumbnailStrip');
        this.morphSlider = document.getElementById('morphSlider');
        this.morphValue = document.getElementById('morphValue');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.noFaceWarning = document.getElementById('noFaceWarning');
        this.statusOverlay = document.getElementById('statusOverlay');
        this.statusText = document.getElementById('statusText');
        this.scanResult = document.getElementById('scanResult');
        this.sidebar = document.getElementById('sidebar');

        // Canvas contexts
        this.outputCtx = this.outputCanvas.getContext('2d');
        this.processingCtx = this.processingCanvas.getContext('2d');

        // State
        this.state = {
            currentCategory: 'celebs',
            selectedImageIndex: 0,
            morphAmount: 0,
            isRecording: false,
            faceDetected: false,
            sidebarOpen: false,
            selectedAddon: null,
            detectedGender: null
        };

        // Categories and assets
        this.categories = ['animals', 'celebs', 'history', 'races', 'addons'];
        this.assets = {};
        this.currentAssets = [];

        // Target face data
        this.targetImage = null;
        this.targetLandmarks = null;
        this.triangles = [];

        // Camera landmarks
        this.cameraLandmarks = null;

        // Morph engine
        this.morphEngine = new MorphEngine();

        // MediaPipe Face Mesh
        this.faceMesh = null;

        // Face-API.js models loaded flag
        this.faceApiLoaded = false;

        // Recording
        this.mediaRecorder = null;
        this.recordedChunks = [];

        // Target canvas for storing loaded target image
        this.targetCanvas = document.createElement('canvas');
        this.targetCtx = this.targetCanvas.getContext('2d');

        // Initialize
        this.init();
    }

    async init() {
        try {
            // Load asset manifest
            await this.loadAssets();

            // Run FaceMesh, FaceAPI, and Camera initialization in parallel
            // Use allSettled so that if one fails, others can continue
            const initPromises = [
                this.initFaceMesh(),
                this.initFaceApi(),
                this.initCamera()
            ];

            const results = await Promise.allSettled(initPromises);

            // Check if any initialization failed
            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'rejected') {
                    console.warn(`[FaceMorphApp] Initialization step ${i} failed:`, results[i].reason);
                }
            }

            // Setup event listeners
            this.setupEventListeners();

            // Load initial category (shows all images initially)
            this.loadCategory(this.state.currentCategory);

            // Start continuous gender detection every 3 seconds
            this.startContinuousGenderDetection();

            console.log('[FaceMorphApp] Initialized successfully');
        } catch (error) {
            console.error('[FaceMorphApp] Initialization error:', error);
            this.showStatus('Failed to initialize: ' + error.message, true);
        }
    }

    async initFaceApi() {
        try {
            // Wait for face-api.js to be available (with 10 second timeout)
            if (typeof faceapi === 'undefined') {
                console.log('[FaceAPI] Waiting for face-api.js to load...');
                await new Promise((resolve, reject) => {
                    let resolved = false;
                    const timeoutId = setTimeout(() => {
                        if (!resolved) {
                            resolved = true;
                            console.warn('[FaceAPI] Timeout waiting for face-api.js, skipping gender detection');
                            this.faceApiLoaded = false;
                            resolve(); // Continue without face-api
                        }
                    }, 10000);

                    const checkInterval = setInterval(() => {
                        if (typeof faceapi !== 'undefined') {
                            if (!resolved) {
                                resolved = true;
                                clearTimeout(timeoutId);
                                clearInterval(checkInterval);
                                resolve();
                            }
                        }
                    }, 100);
                });
            }

            // If face-api didn't load, skip model loading
            if (typeof faceapi === 'undefined') {
                console.log('[FaceAPI] face-api.js not available, skipping gender detection');
                this.faceApiLoaded = false;
                return;
            }

            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

            console.log('[FaceAPI] Loading models...');

            // Load required models for gender detection with timeout
            const modelLoadPromise = Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL)
            ]);

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Model loading timeout')), 10000)
            );

            try {
                await Promise.race([modelLoadPromise, timeoutPromise]);
                this.faceApiLoaded = true;
                console.log('[FaceAPI] Models loaded successfully');
            } catch (error) {
                console.warn('[FaceAPI] Model loading failed or timed out, continuing without gender detection:', error.message);
                this.faceApiLoaded = false;
            }
        } catch (error) {
            console.error('[FaceAPI] Failed to initialize:', error);
            this.faceApiLoaded = false;
        }
    }

    async loadAssets() {
        // Define available assets for each category using web_version's morph_images folder
        this.assets = {
            // Animals
            animals: [
                { name: 'Cat', image: 'morph_images/animals/d920f7d8a6847feeda309dc8c2ef9063.png', landmarks: 'morph_images/landmarks/animals/d920f7d8a6847feeda309dc8c2ef9063.json' },
                { name: 'Owl', image: 'morph_images/animals/owl.png', landmarks: 'morph_images/landmarks/animals/owl.json' },
                { name: 'Gorilla', image: 'morph_images/animals/gorella.jpeg', landmarks: 'morph_images/landmarks/animals/gorella.json' },
                { name: 'Animal', image: 'morph_images/animals/WhatsApp Image 2025-12-17 at 7.47.05 PM.jpeg', landmarks: 'morph_images/landmarks/animals/WhatsApp Image 2025-12-17 at 7.47.05 PM.json' }
            ],
            // Celebrities  
            celebs: [
                { name: 'Mo Salah', image: 'morph_images/celebrities/mo salah.jpg', landmarks: 'morph_images/landmarks/celebrities/mo salah.json', gender: 'male' },
                { name: 'Ronaldo', image: 'morph_images/celebrities/ronaldo.png', landmarks: 'morph_images/landmarks/celebrities/ronaldo.json', gender: 'male' },
                { name: 'Dr. Tamer', image: 'morph_images/celebrities/DR.Tamer.png', landmarks: 'morph_images/landmarks/celebrities/DR.Tamer.json', gender: 'male' },
                { name: 'Celebrity 1', image: 'morph_images/celebrities/3bb55314ed43151d5597844180b9dd51.png', landmarks: 'morph_images/landmarks/celebrities/3bb55314ed43151d5597844180b9dd51.json', gender: 'male' },
                { name: 'Celebrity 2', image: 'morph_images/celebrities/4849ba2ea6517f805785071120cccc08.png', landmarks: 'morph_images/landmarks/celebrities/4849ba2ea6517f805785071120cccc08.json', gender: 'male' },
                { name: 'Angelina Jolie', image: 'morph_images/celebrities/angelina_female.jpg', landmarks: 'morph_images/landmarks/celebrities/angelina_female.json', gender: 'female' },
                { name: 'Billie Eilish', image: 'morph_images/celebrities/bellie_female.png', landmarks: 'morph_images/landmarks/celebrities/bellie_female.json', gender: 'female' }
            ],
            // History figures
            history: [
                { name: 'Napoleon', image: 'morph_images/historical/Napoleon.png', landmarks: 'morph_images/landmarks/historical/Napoleon.json', gender: 'male' },
                { name: 'Donald Trump', image: 'morph_images/historical/Donald_Trump.png', landmarks: 'morph_images/landmarks/historical/Donald_Trump.json', gender: 'male' },
                { name: 'Anwar Sadat', image: 'morph_images/historical/Anwar-Sadat.png', landmarks: 'morph_images/landmarks/historical/Anwar-Sadat.json', gender: 'male' },
                { name: 'El Sisi', image: 'morph_images/historical/abdelfatah_elsisi.png', landmarks: 'morph_images/landmarks/historical/abdelfatah_elsisi.json', gender: 'male' },
                { name: 'Elon Musk', image: 'morph_images/historical/ElonMusk.png', landmarks: 'morph_images/landmarks/historical/ElonMusk.json', gender: 'male' },
                { name: 'Historical Figure 1', image: 'morph_images/historical/WhatsApp Image 2025-12-17 at 9.20.01 PM.png', landmarks: 'morph_images/landmarks/historical/WhatsApp Image 2025-12-17 at 9.20.01 PM.json', gender: 'female' },
                { name: 'Historical Figure 2', image: 'morph_images/historical/WhatsApp Image 2025-12-17 at 9.20.02 PM.png', landmarks: 'morph_images/landmarks/historical/WhatsApp Image 2025-12-17 at 9.20.02 PM.json', gender: 'female' }
            ],
            // Races
            races: [
                { name: 'African', image: 'morph_images/races/african_male.png', landmarks: 'morph_images/landmarks/races/african_male.json', gender: 'male' },
                { name: 'Asian', image: 'morph_images/races/asian_male.png', landmarks: 'morph_images/landmarks/races/asian_male.json', gender: 'male' },
                { name: 'European', image: 'morph_images/races/european_male.png', landmarks: 'morph_images/landmarks/races/european_male.json', gender: 'male' },
                { name: 'Indian', image: 'morph_images/races/indian_male.png', landmarks: 'morph_images/landmarks/races/indian_male.json', gender: 'male' },
                { name: 'African (F)', image: 'morph_images/races/african_female.png', landmarks: 'morph_images/landmarks/races/african_female.json', gender: 'female' },
                { name: 'Asian (F)', image: 'morph_images/races/asian_female.png', landmarks: 'morph_images/landmarks/races/asian_female.json', gender: 'female' },
                { name: 'European (F)', image: 'morph_images/races/european_female.png', landmarks: 'morph_images/landmarks/races/european_female.json', gender: 'female' },
                { name: 'Indian (F)', image: 'morph_images/races/indean_female.png', landmarks: 'morph_images/landmarks/races/indean_female.json', gender: 'female' }
            ],
            // Addons  
            addons: [
                { name: 'Glasses (Male)', image: 'morph_images/addons/glasses/glasses_male-removebg-preview.png', isAddon: true, type: 'glasses', gender: 'male' },
                { name: 'Heart Glasses', image: 'morph_images/addons/glasses/_Pngtree_pink_heart_eye_glasses_7424205-removebg-preview.png', isAddon: true, type: 'glasses', gender: 'female' },
                { name: 'Moustache', image: 'morph_images/addons/mustaches/mustache.png', isAddon: true, type: 'moustache', gender: 'male' },
                { name: 'Mustache 2', image: 'morph_images/addons/mustaches/mostache_male-removebg-preview.png', isAddon: true, type: 'moustache', gender: 'male' },
                { name: 'Beard', image: 'morph_images/addons/mustaches/beard.png', isAddon: true, type: 'beard', gender: 'male' },
                { name: 'Hat', image: 'morph_images/addons/wigs/Hat-removebg-preview.png', isAddon: true, type: 'hat', gender: 'male' }
            ]
        };

        // Preload addon images
        for (const addon of this.assets.addons) {
            addon.imageElement = await this.loadImage(addon.image).catch(() => null);
        }
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            img.src = src;
        });
    }

    async initFaceMesh() {
        return new Promise((resolve, reject) => {
            let timeoutId = null;
            let resolved = false;

            this.faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            this.faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.faceMesh.onResults((results) => this.onFaceMeshResults(results));

            // Set timeout for initialization (15 seconds)
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn('[FaceMesh] Initialization timed out after 15s, continuing anyway...');
                    resolve(); // Continue without FaceMesh fully initialized
                }
            }, 15000);

            // Initialize
            this.faceMesh.initialize().then(() => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    console.log('[FaceMesh] Initialized');
                    resolve();
                }
            }).catch((error) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    console.error('[FaceMesh] Initialization error:', error);
                    reject(error);
                }
            });
        });
    }

    async initCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            });

            this.video.srcObject = stream;
            this.stream = stream;

            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });

            // Set canvas sizes
            const { videoWidth, videoHeight } = this.video;
            this.outputCanvas.width = videoWidth;
            this.outputCanvas.height = videoHeight;
            this.processingCanvas.width = videoWidth;
            this.processingCanvas.height = videoHeight;

            // Hide loading overlay
            this.loadingOverlay.classList.add('hidden');

            // Start processing loop
            this.startProcessing();

            console.log(`[Camera] Started at ${videoWidth}x${videoHeight}`);
        } catch (error) {
            console.warn('[Camera] Error:', error);
            console.log('[Camera] Camera access unavailable, using demo mode');
            
            // Ensure stream is null in demo mode
            this.stream = null;
            
            // Set default canvas sizes for demo mode
            const demoWidth = 1280;
            const demoHeight = 720;
            this.outputCanvas.width = demoWidth;
            this.outputCanvas.height = demoHeight;
            this.processingCanvas.width = demoWidth;
            this.processingCanvas.height = demoHeight;

            // Hide loading overlay after showing demo message briefly
            setTimeout(() => {
                this.loadingOverlay.classList.add('hidden');
            }, 2000);

            // Draw a placeholder on canvas
            this.outputCtx.fillStyle = '#2a2a3e';
            this.outputCtx.fillRect(0, 0, demoWidth, demoHeight);
            this.outputCtx.fillStyle = '#666';
            this.outputCtx.font = '24px Arial';
            this.outputCtx.textAlign = 'center';
            this.outputCtx.fillText('Demo Mode - Camera Not Available', demoWidth / 2, demoHeight / 2);
        }
    }

    startProcessing() {
        const processFrame = async () => {
            if (this.video.readyState >= 2) {
                await this.faceMesh.send({ image: this.video });
            }
            requestAnimationFrame(processFrame);
        };
        processFrame();
    }

    onFaceMeshResults(results) {
        const { videoWidth, videoHeight } = this.video;

        // Draw video frame
        this.outputCtx.save();
        this.outputCtx.scale(-1, 1);
        this.outputCtx.drawImage(this.video, -videoWidth, 0, videoWidth, videoHeight);
        this.outputCtx.restore();

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];

            // Convert normalized landmarks to pixel coordinates (with horizontal flip)
            this.cameraLandmarks = landmarks.map(pt => [
                (1 - pt.x) * videoWidth,  // Flip horizontally
                pt.y * videoHeight
            ]);

            this.state.faceDetected = true;
            this.noFaceWarning.classList.remove('visible');

            // Apply morphing or addon
            if (this.state.selectedAddon) {
                this.applyAddon();
            } else if (this.state.morphAmount > 0.01 && this.targetImage && this.targetLandmarks) {
                this.applyMorph();
            } else if (this.state.morphAmount > 0.01) {
                // Debug: show why morphing is not happening
                if (!this.targetImage) console.warn('[Morph] No target image loaded');
                if (!this.targetLandmarks) console.warn('[Morph] No target landmarks loaded');
            }
        } else {
            this.state.faceDetected = false;
            this.cameraLandmarks = null;
            this.noFaceWarning.classList.add('visible');
        }

        // Record frame if recording
        if (this.state.isRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            // Recording is handled by MediaRecorder capturing the canvas stream
        }
    }

    applyMorph() {
        if (!this.cameraLandmarks || !this.targetLandmarks) return;

        const { videoWidth, videoHeight } = this.video;
        const alpha = this.state.morphAmount;

        try {
            // Get source image data from the canvas
            const srcData = this.outputCtx.getImageData(0, 0, videoWidth, videoHeight);

            // Get target image data
            const targetData = this.targetCtx.getImageData(0, 0, this.targetCanvas.width, this.targetCanvas.height);

            // Create output buffer
            const outputData = this.outputCtx.createImageData(videoWidth, videoHeight);

            // Perform morphing using the engine
            // Pass isAnimal flag for special opacity handling
            const isAnimal = this.state.currentCategory === 'animals';
            this.morphEngine.morphFace(
                srcData,
                targetData,
                this.cameraLandmarks,
                this.targetLandmarks,
                alpha,
                outputData,
                isAnimal
            );

            // Draw result
            this.outputCtx.putImageData(outputData, 0, 0);
        } catch (error) {
            console.error('[Morph] Error:', error);
        }
    }

    /**
     * Calculate head rotation from face landmarks
     * Returns { yaw, roll, pitch } in radians
     */
    calculateHeadRotation(landmarks) {
        // Key landmarks for rotation detection
        const leftEye = landmarks[33];   // Left eye outer corner
        const rightEye = landmarks[263]; // Right eye outer corner
        const noseTip = landmarks[1];    // Nose tip
        const leftCheek = landmarks[234]; // Left side of face
        const rightCheek = landmarks[454]; // Right side of face
        const chin = landmarks[152];      // Chin
        const forehead = landmarks[10];   // Top of forehead

        if (!leftEye || !rightEye || !noseTip || !chin || !forehead) {
            return { yaw: 0, roll: 0, pitch: 0 };
        }

        // Roll: rotation around the Z axis (head tilt left/right)
        const eyeDeltaX = rightEye[0] - leftEye[0];
        const eyeDeltaY = rightEye[1] - leftEye[1];
        const roll = Math.atan2(eyeDeltaY, eyeDeltaX);

        // Yaw: rotation around the Y axis (head turn left/right)
        const noseToLeft = Math.sqrt(Math.pow(noseTip[0] - leftCheek[0], 2) + Math.pow(noseTip[1] - leftCheek[1], 2));
        const noseToRight = Math.sqrt(Math.pow(noseTip[0] - rightCheek[0], 2) + Math.pow(noseTip[1] - rightCheek[1], 2));
        const faceWidth = noseToLeft + noseToRight;
        const yaw = ((noseToLeft - noseToRight) / faceWidth) * Math.PI * 0.5;

        // Pitch: rotation around the X axis (head look up/down)
        const eyeCenter = [(leftEye[0] + rightEye[0]) / 2, (leftEye[1] + rightEye[1]) / 2];
        const verticalFaceHeight = chin[1] - forehead[1];
        const noseYRelative = (noseTip[1] - eyeCenter[1]) / verticalFaceHeight;
        const pitch = (noseYRelative - 0.3) * Math.PI * 0.5;

        return { yaw, roll, pitch };
    }

    applyAddon() {
        if (!this.cameraLandmarks || !this.state.selectedAddon) return;

        const addon = this.state.selectedAddon;
        if (!addon.imageElement) return;

        const { videoWidth, videoHeight } = this.video;
        const landmarks = this.cameraLandmarks;

        try {
            let position, size;

            // Calculate head rotation for all addon types
            const rotation = this.calculateHeadRotation(landmarks);

            switch (addon.type) {
                case 'glasses':
                case 'sunglasses':
                    // Position between eyes
                    const leftEye = landmarks[33];
                    const rightEye = landmarks[263];
                    if (!leftEye || !rightEye) return;

                    const eyeDistance = Math.sqrt(
                        Math.pow(rightEye[0] - leftEye[0], 2) +
                        Math.pow(rightEye[1] - leftEye[1], 2)
                    );

                    size = {
                        width: eyeDistance * 2.2,
                        height: (eyeDistance * 2.2) * (addon.imageElement.height / addon.imageElement.width)
                    };

                    position = {
                        x: (leftEye[0] + rightEye[0]) / 2,
                        y: (leftEye[1] + rightEye[1]) / 2
                    };
                    break;

                case 'moustache':
                case 'beard':
                    // Position at mouth using correct MediaPipe landmarks
                    const mouthLeft = landmarks[61];    // Left mouth corner
                    const mouthRight = landmarks[291];  // Right mouth corner
                    const upperLip = landmarks[13];     // Upper lip top center
                    const lowerLip = landmarks[14];     // Lower lip bottom center
                    const noseTip = landmarks[1];       // Nose tip

                    if (!mouthLeft || !mouthRight || !upperLip || !lowerLip) return;

                    const mouthWidth = Math.sqrt(
                        Math.pow(mouthRight[0] - mouthLeft[0], 2) +
                        Math.pow(mouthRight[1] - mouthLeft[1], 2)
                    );

                    const mouthCenter = {
                        x: (mouthLeft[0] + mouthRight[0]) / 2,
                        y: (mouthLeft[1] + mouthRight[1]) / 2
                    };

                    if (addon.type === 'beard') {
                        // Position beard at lower lip/chin area
                        size = {
                            width: mouthWidth * 2.5,  // Much bigger for better coverage
                            height: (mouthWidth * 2.5) * (addon.imageElement.height / addon.imageElement.width)
                        };

                        position = {
                            x: mouthCenter.x,
                            y: lowerLip[1] + size.height * 0.35  // Position below lower lip
                        };
                    } else {
                        // Position moustache at upper lip area
                        size = {
                            width: mouthWidth * 2.5,  // Much bigger for better visibility
                            height: (mouthWidth * 2.5) * (addon.imageElement.height / addon.imageElement.width)
                        };

                        // Position between nose and upper lip (natural mustache position)
                        const noseToLipMidpoint = (noseTip[1] + upperLip[1]) / 2;

                        position = {
                            x: mouthCenter.x,
                            y: noseToLipMidpoint + size.height * 0.1  // Slightly below midpoint
                        };
                    }
                    break;

                case 'wig':
                case 'hair':
                case 'clown':
                case 'hat':
                    // Position on top of head
                    const top = landmarks[10];
                    const left = landmarks[234];
                    const right = landmarks[454];
                    if (!top || !left || !right) return;

                    const faceWidth = Math.sqrt(
                        Math.pow(right[0] - left[0], 2) +
                        Math.pow(right[1] - left[1], 2)
                    );

                    size = {
                        width: faceWidth * 1.8,
                        height: (faceWidth * 1.8) * (addon.imageElement.height / addon.imageElement.width)
                    };

                    const centerX = (left[0] + right[0]) / 2;
                    position = {
                        x: centerX,
                        y: top[1] - size.height * 0.2
                    };
                    break;

                default:
                    // Generic: center on nose
                    const nosePoint = landmarks[1];
                    const faceLeft = landmarks[234];
                    const faceRight = landmarks[454];
                    if (!nosePoint || !faceLeft || !faceRight) return;

                    const width = Math.abs(faceRight[0] - faceLeft[0]) * 0.9;
                    size = {
                        width: width,
                        height: width * (addon.imageElement.height / addon.imageElement.width)
                    };

                    position = {
                        x: nosePoint[0],
                        y: nosePoint[1]
                    };
            }

            // Apply rotation transform to draw addon with head tilt
            this.outputCtx.save();
            this.outputCtx.translate(position.x, position.y);
            this.outputCtx.rotate(rotation.roll);

            // Apply perspective skew for yaw
            const perspectiveScale = 1 - Math.abs(rotation.yaw) * 0.3;
            this.outputCtx.scale(perspectiveScale, 1);

            // Flip vertically for certain addon types
            if (['hat', 'wig', 'hair', 'clown', 'moustache', 'beard', 'glasses', 'sunglasses'].includes(addon.type)) {
                this.outputCtx.scale(1, -1);
            }

            // Draw addon centered at origin
            this.outputCtx.drawImage(
                addon.imageElement,
                -size.width / 2,
                -size.height / 2,
                size.width,
                size.height
            );

            this.outputCtx.restore();
        } catch (error) {
            console.error('[Addon] Error:', error);
        }
    }

    loadCategory(category) {
        this.state.currentCategory = category;
        const allAssets = this.assets[category] || [];

        // Apply gender filtering if gender was detected (except for animals)
        const detectedGender = this.state.detectedGender;
        if (detectedGender && category !== 'animals') {
            const filtered = allAssets.filter(asset => asset.gender === detectedGender);

            if (filtered.length > 0) {
                // Found matching gender images
                this.currentAssets = filtered;
                console.log(`[Category] Showing ${this.currentAssets.length} ${detectedGender} ${category}`);
            } else {
                // No matching gender images, fall back to all images
                this.currentAssets = allAssets;
                console.log(`[Category] No ${detectedGender} ${category} found, showing all ${allAssets.length} images`);

                // Show user-friendly message
                if (allAssets.length > 0) {
                    const genderIcon = detectedGender === 'male' ? '♂' : '♀';
                    this.showStatus(`No ${detectedGender} ${category} available. Showing all options.`, false);
                }
            }
        } else {
            this.currentAssets = allAssets;
        }

        // Clear addon selection when switching to non-addon category
        if (category !== 'addons') {
            this.state.selectedAddon = null;
        }

        // Update tab buttons
        document.querySelectorAll('.tab-btn, .mobile-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        // Render thumbnails
        this.renderThumbnails();

        // Select first item if available
        if (this.currentAssets.length > 0) {
            this.selectAsset(0);
        }
    }

    renderThumbnails() {
        const renderGrid = (container, isMobile = false) => {
            container.innerHTML = '';

            this.currentAssets.forEach((asset, index) => {
                const thumb = document.createElement('div');
                thumb.className = 'thumbnail' + (asset.isAddon ? ' addon-item' : '');
                thumb.dataset.index = index;

                if (index === this.state.selectedImageIndex) {
                    thumb.classList.add('active');
                }

                const img = document.createElement('img');
                img.src = asset.image;
                img.alt = asset.name;
                img.onerror = () => {
                    img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23333" width="100" height="100"/><text fill="%23666" x="50" y="55" text-anchor="middle" font-size="12">No Image</text></svg>';
                };

                thumb.appendChild(img);
                thumb.addEventListener('click', () => this.selectAsset(index));

                container.appendChild(thumb);
            });
        };

        renderGrid(this.thumbnailGrid);
        renderGrid(this.mobileThumbnailStrip, true);
    }

    async selectAsset(index) {
        this.state.selectedImageIndex = index;
        const asset = this.currentAssets[index];

        if (!asset) return;

        // Update thumbnail selection
        document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
            thumb.classList.toggle('active', i === index);
        });

        if (asset.isAddon) {
            // Handle addon selection
            this.state.selectedAddon = asset;
            this.targetImage = null;
            this.targetLandmarks = null;
            this.triangles = [];
            console.log(`[Asset] Selected addon: ${asset.name}`);
        } else {
            // Handle face target selection
            this.state.selectedAddon = null;

            try {
                // Load target image
                this.targetImage = await this.loadImage(asset.image);

                // Set target canvas size and draw image
                this.targetCanvas.width = this.targetImage.width;
                this.targetCanvas.height = this.targetImage.height;
                this.targetCtx.drawImage(this.targetImage, 0, 0);
                
                // Clear morph engine cache when loading new target image
                this.morphEngine.clearCache();

                // Try to load landmarks
                try {
                    const response = await fetch(asset.landmarks);
                    if (response.ok) {
                        this.targetLandmarks = await response.json();
                        console.log(`[Asset] Loaded ${asset.name} with ${this.targetLandmarks.length} landmarks`);
                    } else {
                        throw new Error('Landmarks not found');
                    }
                } catch (e) {
                    console.warn(`[Asset] No landmarks for ${asset.name}:`, e.message);
                    this.targetLandmarks = null;
                    this.showStatus(`No landmarks for ${asset.name} - Morphing disabled`, true);
                }
            } catch (error) {
                console.error(`[Asset] Failed to load ${asset.name}:`, error);
                this.showStatus(`Failed to load ${asset.name}`, true);
            }
        }
    }

    setupEventListeners() {
        // Morph slider
        this.morphSlider.addEventListener('input', (e) => {
            this.state.morphAmount = parseInt(e.target.value) / 100;
            this.morphValue.textContent = `${e.target.value}%`;
        });

        // Category tabs (desktop)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.loadCategory(btn.dataset.category);
            });
        });

        // Category tabs (mobile)
        document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.loadCategory(btn.dataset.category);
            });
        });

        // Desktop buttons
        document.getElementById('scanBtn').addEventListener('click', () => this.scanGender());
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('snapshotBtn').addEventListener('click', () => this.takeSnapshot());

        // Mobile buttons
        document.getElementById('mobileScanBtn').addEventListener('click', () => this.scanGender());
        document.getElementById('mobileRecordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('mobileSnapshotBtn').addEventListener('click', () => this.takeSnapshot());
        document.getElementById('toggleSidebarBtn').addEventListener('click', () => this.toggleSidebar());

        // Sidebar overlay click to close
        document.addEventListener('click', (e) => {
            if (this.state.sidebarOpen && !this.sidebar.contains(e.target) &&
                !e.target.closest('#toggleSidebarBtn')) {
                this.closeSidebar();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && this.state.sidebarOpen) {
                this.closeSidebar();
            }
        });
    }

    toggleSidebar() {
        this.state.sidebarOpen = !this.state.sidebarOpen;
        this.sidebar.classList.toggle('open', this.state.sidebarOpen);

        // Create/toggle overlay
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => this.closeSidebar());
        }
        overlay.classList.toggle('visible', this.state.sidebarOpen);
    }

    closeSidebar() {
        this.state.sidebarOpen = false;
        this.sidebar.classList.remove('open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('visible');
    }

    startContinuousGenderDetection() {
        // Skip if face-api not loaded or no camera
        if (!this.faceApiLoaded || !this.stream) {
            console.log('[Gender] Skipping continuous gender detection - face-api not available or no camera');
            return;
        }

        // Wait 1.5 seconds for camera to stabilize, then start continuous detection
        setTimeout(() => {
            this.scanGender();  // Initial scan

            // Then scan every 3 seconds to detect when different people appear
            setInterval(() => {
                this.scanGenderContinuous();
            }, 3000);
        }, 1500);
    }

    async scanGenderContinuous() {
        // Silent gender detection (doesn't show status messages)
        if (!this.faceApiLoaded || !this.video.readyState) return;

        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.video.videoWidth;
            tempCanvas.height = this.video.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.video, 0, 0);

            const detection = await faceapi
                .detectSingleFace(tempCanvas, new faceapi.TinyFaceDetectorOptions())
                .withAgeAndGender();

            if (detection) {
                const gender = detection.gender;
                const previousGender = this.state.detectedGender;

                // Only update if gender changed
                if (gender !== previousGender) {
                    this.state.detectedGender = gender;
                    const genderIcon = gender === 'male' ? '♂' : '♀';
                    this.scanResult.textContent = genderIcon;

                    // Reload current category with new gender filter
                    this.loadCategory(this.state.currentCategory);
                    console.log(`[Gender] Switched to ${gender}`);
                }
            }
        } catch (error) {
            // Silent fail - don't spam console
        }
    }

    async scanGender() {
        if (!this.faceApiLoaded) {
            this.showStatus('Gender detection not available', true);
            return;
        }

        const scanBtn = document.getElementById('scanBtn');
        const mobileScanBtn = document.getElementById('mobileScanBtn');
        scanBtn.classList.add('scanning');
        this.scanResult.textContent = '...';

        try {
            // Create a canvas from the current video frame
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.video.videoWidth;
            tempCanvas.height = this.video.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.video, 0, 0);

            // Detect face and gender
            const detection = await faceapi
                .detectSingleFace(tempCanvas, new faceapi.TinyFaceDetectorOptions())
                .withAgeAndGender();

            if (detection) {
                const gender = detection.gender;
                const probability = Math.round(detection.genderProbability * 100);

                this.state.detectedGender = gender;
                const genderIcon = gender === 'male' ? '♂' : '♀';
                this.scanResult.textContent = genderIcon;
                this.showStatus(`${genderIcon} Detected as ${gender} (${probability}%). Filtering images...`, false);

                // Reload current category with gender filter
                this.loadCategory(this.state.currentCategory);
            } else {
                this.scanResult.textContent = '?';
                this.showStatus('No face detected for scanning', true);
            }
        } catch (error) {
            console.error('[Scan] Error:', error);
            this.scanResult.textContent = '!';
            this.showStatus('Scan failed', true);
        }

        scanBtn.classList.remove('scanning');
    }

    toggleRecording() {
        if (this.state.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        try {
            // Create a stream from the output canvas
            const canvasStream = this.outputCanvas.captureStream(30);

            // Try to add audio track
            if (this.stream) {
                const audioTracks = this.stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    canvasStream.addTrack(audioTracks[0]);
                }
            }

            // Create MediaRecorder
            this.mediaRecorder = new MediaRecorder(canvasStream, {
                mimeType: 'video/webm;codecs=vp9'
            });

            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `face-morph-${Date.now()}.webm`;
                a.click();
                URL.revokeObjectURL(url);
            };

            this.mediaRecorder.start();
            this.state.isRecording = true;

            // Update UI
            document.getElementById('recordBtn').classList.add('recording');
            document.getElementById('mobileRecordBtn').classList.add('recording');
            this.showStatus('Recording started...', false);
        } catch (error) {
            console.error('[Recording] Error:', error);
            this.showStatus('Failed to start recording', true);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            this.state.isRecording = false;

            document.getElementById('recordBtn').classList.remove('recording');
            document.getElementById('mobileRecordBtn').classList.remove('recording');
            this.showStatus('Recording saved!', false);
        }
    }

    takeSnapshot() {
        try {
            const link = document.createElement('a');
            link.download = `face-morph-${Date.now()}.png`;
            link.href = this.outputCanvas.toDataURL('image/png');
            link.click();
            this.showStatus('Snapshot saved!', false);
        } catch (error) {
            console.error('[Snapshot] Error:', error);
            this.showStatus('Failed to save snapshot', true);
        }
    }

    showStatus(message, isError = false) {
        this.statusText.textContent = message;
        this.statusText.classList.toggle('error', isError);
        this.statusOverlay.classList.add('visible');

        setTimeout(() => {
            this.statusOverlay.classList.remove('visible');
        }, 3000);
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FaceMorphApp();
});
