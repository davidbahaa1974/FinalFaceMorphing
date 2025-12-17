class Camera {
    constructor(videoElement, options) {
        this.video = videoElement;
        this.onFrame = options.onFrame || (() => { });
        this.width = options.width || 640;
        this.height = options.height || 480;
        this.stream = null;
        this.isRunning = false;
    }

    async start() {
        if (this.isRunning) return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: this.width },
                    height: { ideal: this.height }
                },
                audio: false
            });
            this.video.srcObject = this.stream;

            this.video.onloadedmetadata = () => {
                this.isRunning = true;
                this.video.play();
                this.loop();
            };
        } catch (error) {
            console.error("Camera access error:", error);
            alert("Camera access failed. Please ensure HTTPS is enabled and permissions granted.");
        }
    }

    async loop() {
        if (!this.isRunning) return;
        await this.onFrame();
        requestAnimationFrame(this.loop.bind(this));
    }

    stop() {
        this.isRunning = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}
