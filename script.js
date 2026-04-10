(function() {
    // Ambil konfigurasi dari config.js
    const IMGBB_KEY = CONFIG.IMGBB_KEY;
    const UPSCALE_API = CONFIG.UPSCALE_API;

    // DOM Elements
    const fileInput = document.getElementById('fileInput');
    const uploadZone = document.getElementById('uploadZone');
    const originalPreview = document.getElementById('originalPreview');
    const resultPreview = document.getElementById('resultPreview');
    const upscaleBtn = document.getElementById('upscaleBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusMsg = document.getElementById('statusMsg');
    const statusText = document.getElementById('statusText');
    const urlIndicator = document.getElementById('urlIndicator');
    const urlText = document.getElementById('urlText');
    const uploadBadge = document.getElementById('uploadBadge');
    const processBadge = document.getElementById('processBadge');

    // State
    let selectedFile = null;
    let publicUrl = null;
    let resultBlob = null;
    let isProcessing = false;

    // Helper Functions
    function setUploadBadge(type, text) {
        uploadBadge.className = 'badge';
        if (type) uploadBadge.classList.add(type);
        const icon = type === 'processing' ? 'fa-spinner fa-pulse' : 'fa-circle';
        uploadBadge.innerHTML = `<i class="fas ${icon}"></i><span>${text}</span>`;
    }

    function setProcessBadge(type, text) {
        processBadge.className = 'badge';
        if (type) processBadge.classList.add(type);
        const icon = type === 'processing' ? 'fa-spinner fa-pulse' : 'fa-circle';
        processBadge.innerHTML = `<i class="fas ${icon}"></i><span>${text}</span>`;
    }

    function setStatus(type, message) {
        statusMsg.className = 'status-msg ' + type;
        statusText.textContent = message;
        const icon = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            info: 'fa-info-circle'
        }[type];
        statusMsg.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    }

    // Upload to ImgBB
    async function uploadToHosting(file) {
        const formData = new FormData();
        formData.append('image', file);

        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Upload failed');
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message || 'Upload failed');
        
        return data.data.url;
    }

    // Handle File
    async function handleFile(file) {
        // Validation
        if (!file.type.startsWith('image/')) {
            setStatus('error', 'Please select an image file');
            return;
        }
        if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
            setStatus('error', `Max file size is ${CONFIG.MAX_FILE_SIZE_MB}MB`);
            return;
        }

        selectedFile = file;
        
        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            originalPreview.innerHTML = `<img src="${e.target.result}" alt="original">`;
        };
        reader.readAsDataURL(file);

        // Reset result
        resultPreview.innerHTML = `<div class="placeholder-content"><i class="fas fa-eye-slash"></i><span>Result will appear here</span></div>`;
        downloadBtn.classList.add('hidden');
        resultBlob = null;
        
        // Update UI
        setStatus('info', 'Uploading to hosting...');
        setUploadBadge('processing', 'Uploading');
        urlText.innerText = 'Uploading...';
        urlIndicator.classList.remove('success');
        upscaleBtn.disabled = true;
        setProcessBadge('standby', 'Standby');

        try {
            const url = await uploadToHosting(file);
            publicUrl = url;
            
            urlText.innerText = '✓ Ready for upscale';
            urlIndicator.classList.add('success');
            setStatus('success', 'Image ready! Click upscale');
            setUploadBadge('success', 'Ready');
            upscaleBtn.disabled = false;
            
        } catch (error) {
            console.error(error);
            setStatus('error', 'Upload failed: ' + (error.message || 'Try again'));
            setUploadBadge('error', 'Error');
            urlText.innerText = 'Upload failed';
            publicUrl = null;
        }
    }

    // Process Upscale
    async function processUpscale() {
        if (!publicUrl || isProcessing) return;

        isProcessing = true;
        upscaleBtn.disabled = true;
        
        // Update UI
        setStatus('info', 'AI is upscaling your image...');
        setProcessBadge('processing', 'Processing');
        resultPreview.innerHTML = `
            <div class="placeholder-content">
                <div class="spinner spinner-lg"></div>
                <span>Enhancing image...</span>
            </div>
        `;
        downloadBtn.classList.add('hidden');

        try {
            const apiUrl = `${UPSCALE_API}${encodeURIComponent(publicUrl)}`;
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

            const response = await fetch(apiUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'image/*' }
            });
            
            clearTimeout(timeout);

            if (!response.ok) throw new Error(`API error (${response.status})`);

            // Get image blob
            const blob = await response.blob();
            
            // Clean old blob
            if (resultBlob) URL.revokeObjectURL(resultBlob);
            
            // Create new blob URL
            resultBlob = URL.createObjectURL(blob);
            
            // Display result
            resultPreview.innerHTML = `<img src="${resultBlob}" alt="upscaled">`;
            
            // Setup download
            downloadBtn.onclick = (e) => {
                e.preventDefault();
                const link = document.createElement('a');
                link.href = resultBlob;
                link.download = `pixelforge-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
            
            downloadBtn.classList.remove('hidden');
            
            // Update status
            setStatus('success', 'Upscale completed!');
            setProcessBadge('success', 'Done');
            
        } catch (error) {
            console.error(error);
            
            let msg = 'Process failed';
            if (error.name === 'AbortError') msg = 'Request timeout';
            else if (error.message) msg = error.message;
            
            setStatus('error', msg);
            setProcessBadge('error', 'Error');
            
            resultPreview.innerHTML = `
                <div class="placeholder-content">
                    <i class="fas fa-exclamation-triangle" style="color: #f87171;"></i>
                    <span>Upscale failed</span>
                </div>
            `;
        } finally {
            isProcessing = false;
            if (publicUrl) upscaleBtn.disabled = false;
        }
    }

    // Event Listeners
    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#3b82f6';
        uploadZone.style.background = 'rgba(59,130,246,0.1)';
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.style.borderColor = 'rgba(59,130,246,0.3)';
        uploadZone.style.background = 'rgba(0,0,0,0.2)';
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = 'rgba(59,130,246,0.3)';
        uploadZone.style.background = 'rgba(0,0,0,0.2)';
        
        const file = e.dataTransfer.files[0];
        if (file) {
            fileInput.files = e.dataTransfer.files;
            handleFile(file);
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });

    upscaleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        processUpscale();
    });

    // Cleanup
    window.addEventListener('beforeunload', () => {
        if (resultBlob) URL.revokeObjectURL(resultBlob);
    });
})();
