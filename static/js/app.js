document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    
    const uploadMode = document.getElementById('upload-mode');
    const previewMode = document.getElementById('preview-mode');
    
    const imagePreview = document.getElementById('image-preview');
    const previewFilename = document.getElementById('preview-filename');
    const previewResolution = document.getElementById('preview-resolution');
    const scannerLine = document.getElementById('scanner-line');
    const scannerOverlay = document.getElementById('scanner-overlay');
    
    const cancelBtn = document.getElementById('cancel-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    const errorMessage = document.getElementById('error-message');

    const resultsPlaceholder = document.getElementById('results-placeholder');
    const resultsContent = document.getElementById('results-content');
    const resetBtn = document.getElementById('reset-btn');
    const exportActions = document.getElementById('export-actions');
    const btnExportJson = document.getElementById('btn-export-json');
    const btnExportPdf = document.getElementById('btn-export-pdf');
    
    const explanationText = document.getElementById('explanation-text');
    const recommendationText = document.getElementById('recommendation-text');
    
    const themeToggleBtn = document.getElementById('theme-toggle');
    const sunIcon = themeToggleBtn.querySelector('.sun-icon');
    const moonIcon = themeToggleBtn.querySelector('.moon-icon');

    let currentFile = null;
    let inspectionHistory = [];
    let lastResultData = null;

    // Defect Explanations & Recommendations
    const insights = {
        'crazing': {
            desc: 'Fine network of cracks on the surface, usually caused by uneven cooling or thermal stress during manufacturing.',
            action: 'Inspect temperature control systems and optimize cooling rates to reduce thermal gradients.'
        },
        'inclusion': {
            desc: 'Foreign non-metallic particles trapped in the steel during the casting process, weakening the structure.',
            action: 'Verify raw material purity and inspect the continuous casting filtration system.'
        },
        'patches': {
            desc: 'Irregular surface blemishes often resulting from localized oxidation, scale, or uneven rolling.',
            action: 'Clean the rolling equipment and investigate local oxidation parameters.'
        },
        'pitted_surface': {
            desc: 'Small depressions or cavities caused by corrosion, oxidation, or rolling defects on the steel.',
            action: 'Check for corrosive elements in the environment and inspect roll surfaces for excessive wear.'
        },
        'rolled-in_scale': {
            desc: 'Oxide scale embedded firmly into the steel surface during the high-pressure rolling process.',
            action: 'Increase high-pressure descaling water flow and check nozzle alignment.'
        },
        'scratches': {
            desc: 'Linear surface damage caused by mechanical contact or friction during handling and transport.',
            action: 'Inspect guide rolls and handling equipment for mechanical obstructions or excessive friction.'
        }
    };

    // System Status
    checkSystemStatus();

    // Theme Toggle
    const currentTheme = localStorage.getItem('theme') || 'dark';
    if (currentTheme === 'light') enableLightMode();

    themeToggleBtn.addEventListener('click', () => {
        if (document.body.classList.contains('light-mode')) {
            enableDarkMode();
        } else {
            enableLightMode();
        }
    });

    function enableLightMode() {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
        localStorage.setItem('theme', 'light');
    }
    function enableDarkMode() {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
        localStorage.setItem('theme', 'dark');
    }

    // Drag and Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    // Browse Button
    browseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });

    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) handleFile(this.files[0]);
    });

    // Samples
    document.querySelectorAll('.btn-sample').forEach(btn => {
        btn.addEventListener('click', (e) => {
            generateSampleImage(e.target.getAttribute('data-class'));
        });
    });

    // Action Buttons
    cancelBtn.addEventListener('click', resetLeftColumn);
    resetBtn.addEventListener('click', resetAll);
    analyzeBtn.addEventListener('click', analyzeImage);
    
    // Exports
    btnExportJson.addEventListener('click', exportJSON);
    btnExportPdf.addEventListener('click', () => {
        document.getElementById('print-date').textContent = new Date().toLocaleString();
        window.print();
    });

    function handleFile(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!validTypes.includes(file.type)) {
            showError("Invalid file type. PNG or JPEG required.");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showError("File size exceeds 10MB limit.");
            return;
        }

        currentFile = file;
        hideError();
        previewFilename.textContent = file.name;
        previewResolution.textContent = 'Calculating...';

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                previewResolution.textContent = `${img.naturalWidth} x ${img.naturalHeight}`;
                imagePreview.src = e.target.result;
                document.getElementById('result-original-img').src = e.target.result;
                
                uploadMode.classList.add('hidden');
                previewMode.classList.remove('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    async function analyzeImage() {
        if (!currentFile) return;

        // UI Loading State (Scanner Animation)
        analyzeBtn.disabled = true;
        cancelBtn.disabled = true;
        scannerLine.classList.remove('hidden');
        scannerOverlay.classList.remove('hidden');
        hideError();

        const formData = new FormData();
        formData.append('file', currentFile);
        const startTime = performance.now();

        try {
            const response = await fetch('/predict', { method: 'POST', body: formData });
            const processingTimeMs = Math.round(performance.now() - startTime);

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                let errMsg = 'Received an invalid response from the server.';
                if (response.status === 413) errMsg = 'File size is too large for the server to process.';
                else if (response.status === 500) errMsg = 'The server encountered an internal error.';
                else if (response.status === 504) errMsg = 'The server took too long to respond. Please try a smaller image.';
                else if (!text.trim()) errMsg = 'Received an empty response from the server.';
                throw new Error(errMsg);
            }

            if (!response.ok) {
                let baseMsg = data.error || 'An error occurred during analysis.';
                if (response.status === 400) baseMsg = 'Invalid Request: ' + baseMsg;
                else if (response.status === 413) baseMsg = 'File too large: ' + baseMsg;
                else if (response.status === 500) baseMsg = 'Server Error: ' + baseMsg;
                else if (response.status === 504) baseMsg = 'Timeout: ' + baseMsg;
                throw new Error(baseMsg);
            }

            lastResultData = {
                filename: currentFile.name,
                timestamp: new Date().toISOString(),
                processing_time_ms: processingTimeMs,
                results: data
            };

            displayResults(data, processingTimeMs);
            addToHistory(currentFile.name, data.prediction, data.confidence, data.confidence_status, processingTimeMs);

        } catch (error) {
            showError(error.message);
        } finally {
            analyzeBtn.disabled = false;
            cancelBtn.disabled = false;
            scannerLine.classList.add('hidden');
            scannerOverlay.classList.add('hidden');
        }
    }

    function displayResults(data, timeMs) {
        resultsPlaceholder.classList.add('hidden');
        resultsContent.classList.remove('hidden');
        exportActions.classList.remove('hidden');

        document.getElementById('main-class').textContent = data.prediction;
        document.getElementById('res-time').textContent = `${timeMs}ms`;
        
        const confValue = data.confidence.toFixed(1);
        document.getElementById('main-conf').textContent = `${confValue}%`;
        
        const confBar = document.getElementById('main-conf-bar');
        setTimeout(() => { confBar.style.width = `${confValue}%`; }, 50);

        const riskBadge = document.getElementById('risk-badge');
        riskBadge.className = 'severity-badge'; 
        
        if (data.confidence_status === 'High Confidence') {
            riskBadge.textContent = 'Severity: High';
            riskBadge.classList.add('high');
            confBar.style.backgroundColor = 'var(--danger)';
        } else if (data.confidence_status === 'Moderate Confidence') {
            riskBadge.textContent = 'Severity: Elevated';
            riskBadge.classList.add('elevated');
            confBar.style.backgroundColor = 'var(--warning)';
        } else {
            riskBadge.textContent = 'Severity: Low';
            riskBadge.classList.add('low');
            confBar.style.backgroundColor = 'var(--success)';
        }

        // Explanations & Actions
        const insight = insights[data.prediction.toLowerCase()] || {desc: 'No explanation available.', action: 'No recommended action.'};
        explanationText.textContent = insight.desc;
        recommendationText.textContent = insight.action;

        // Top 3
        const topContainer = document.getElementById('top-predictions-container');
        topContainer.innerHTML = '';
        data.top_3.forEach((item, index) => {
            const wrap = document.createElement('div');
            wrap.className = 'pred-bar-wrapper';
            const color = index === 0 ? 'var(--accent-cyan)' : index === 1 ? 'var(--accent-blue)' : 'var(--text-secondary)';
            wrap.innerHTML = `
                <div class="pred-bar-info">
                    <span class="pred-bar-class">${item.class}</span>
                    <span class="pred-bar-pct">${item.confidence.toFixed(1)}%</span>
                </div>
                <div class="pred-bar-track">
                    <div class="pred-bar-fill" style="width: 0%; background-color: ${color}"></div>
                </div>
            `;
            topContainer.appendChild(wrap);
            setTimeout(() => {
                const fill = wrap.querySelector('.pred-bar-fill');
                if(fill) fill.style.width = `${item.confidence}%`;
            }, 100 + (index * 100));
        });

        // Grad-CAM
        const gradcamImg = document.getElementById('result-gradcam-img');
        const gradcamError = document.getElementById('gradcam-error-msg');
        if (data.gradcam_image) {
            gradcamImg.src = data.gradcam_image;
            gradcamImg.classList.remove('hidden');
            gradcamError.classList.add('hidden');
        } else {
            gradcamImg.classList.add('hidden');
            gradcamError.textContent = data.gradcam_error || "Grad-CAM visualization unavailable.";
            gradcamError.classList.remove('hidden');
        }
    }

    // History Logic
    function addToHistory(filename, defect, conf, status, timeMs) {
        const timeString = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        
        // Map confidence status to simpler severity for table
        let severityHtml = '';
        if (status === 'High Confidence') severityHtml = '<span class="severity-badge high" style="padding:0.15rem 0.5rem;font-size:0.7rem;">High</span>';
        else if (status === 'Moderate Confidence') severityHtml = '<span class="severity-badge elevated" style="padding:0.15rem 0.5rem;font-size:0.7rem;">Elevated</span>';
        else severityHtml = '<span class="severity-badge low" style="padding:0.15rem 0.5rem;font-size:0.7rem;">Low</span>';

        inspectionHistory.unshift({
            time: timeString, filename: filename, defect: defect, severityHtml: severityHtml,
            conf: conf.toFixed(1) + '%', timeMs: timeMs + 'ms'
        });
        
        if (inspectionHistory.length > 5) inspectionHistory.pop();
        renderHistory();
    }

    function renderHistory() {
        const tbody = document.getElementById('history-body');
        tbody.innerHTML = '';
        if (inspectionHistory.length === 0) {
            tbody.innerHTML = '<tr class="empty-history"><td colspan="6">No recent inspections.</td></tr>';
            return;
        }
        inspectionHistory.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${h.time}</td>
                <td>${h.filename}</td>
                <td style="text-transform: capitalize; font-weight: 500;">${h.defect}</td>
                <td>${h.severityHtml}</td>
                <td>${h.conf}</td>
                <td>${h.timeMs}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function exportJSON() {
        if (!lastResultData) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lastResultData, null, 2));
        const downloadNode = document.createElement('a');
        downloadNode.setAttribute("href", dataStr);
        downloadNode.setAttribute("download", `inspection_report_${Date.now()}.json`);
        document.body.appendChild(downloadNode);
        downloadNode.click();
        downloadNode.remove();
    }

    function resetLeftColumn() {
        currentFile = null;
        fileInput.value = '';
        imagePreview.src = '';
        hideError();
        previewMode.classList.add('hidden');
        uploadMode.classList.remove('hidden');
    }

    function resetAll() {
        resetLeftColumn();
        resultsContent.classList.add('hidden');
        resultsPlaceholder.classList.remove('hidden');
        exportActions.classList.add('hidden');
        document.getElementById('main-conf-bar').style.width = '0%';
        lastResultData = null;
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
    }

    async function checkSystemStatus() {
        const statusDot = document.getElementById('nav-status-dot');
        const statusText = document.getElementById('nav-status-text');
        try {
            const res = await fetch('/health');
            if (res.ok) {
                statusDot.classList.add('online');
                statusText.textContent = 'System Online';
            } else {
                statusText.textContent = 'System Degraded';
            }
        } catch(e) {
            statusText.textContent = 'System Offline';
        }
    }

    function generateSampleImage(className) {
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 600;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = document.body.classList.contains('light-mode') ? '#e2e8f0' : '#1e293b';
        ctx.fillRect(0, 0, 800, 600);
        
        const noiseColor = document.body.classList.contains('light-mode') ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
        for (let i = 0; i < 4000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? noiseColor : (document.body.classList.contains('light-mode') ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)');
            ctx.fillRect(Math.random() * 800, Math.random() * 600, Math.random() * 5 + 1, Math.random() * 5 + 1);
        }

        ctx.fillStyle = document.body.classList.contains('light-mode') ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 42px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Sample: ${className.toUpperCase()}`, 400, 300);
        
        canvas.toBlob((blob) => {
            const file = new File([blob], `sample_${className}.jpg`, { type: 'image/jpeg' });
            handleFile(file);
        }, 'image/jpeg', 0.9);
    }
});
