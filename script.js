class GPXViewer {
    constructor() {
        this.map = null;
        this.trackLayer = null;
        this.summaryData = [];
        this.colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF8A65', '#BA68C8'];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSavedData();
    }

    setupEventListeners() {
        const fileInput = document.getElementById('gpxFile');
        const clearBtn = document.getElementById('clearBtn');

        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        clearBtn.addEventListener('click', () => this.clearReport());
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) this.handleFile(file);
    }

    async handleFile(file) {
        try {
            const content = await this.readFile(file);
            this.parseGPX(content, file.name);
            this.showMessage('File caricato con successo!', 'success');
        } catch (error) {
            this.showMessage(`Errore: ${error.message}`, 'error');
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Errore nella lettura del file'));
            reader.readAsText(file);
        });
    }

    parseGPX(content, fileName) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');

        if (doc.querySelector('parsererror')) {
            throw new Error('File GPX non valido');
        }

        const tracks = this.extractTracks(doc);
        if (tracks.length === 0) {
            throw new Error('Nessun dato geografico trovato');
        }

        this.displayOnMap(tracks, fileName);
    }

    extractTracks(doc) {
        const tracks = [];
        const trkElements = doc.querySelectorAll('trk');
        trkElements.forEach(trk => {
            trk.querySelectorAll('trkseg').forEach(trkseg => {
                const points = Array.from(trkseg.querySelectorAll('trkpt'))
                    .map((trkpt, i) => {
                        const lat = parseFloat(trkpt.getAttribute('lat'));
                        const lon = parseFloat(trkpt.getAttribute('lon'));
                        
                        if (isNaN(lat) || isNaN(lon)) return null;
                        
                        const eleEl = trkpt.querySelector('ele');
                        const timeEl = trkpt.querySelector('time');
                        
                        return {
                            lat,
                            lon,
                            ele: eleEl ? parseFloat(eleEl.textContent) : null,
                            time: timeEl ? new Date(timeEl.textContent) : null,
                            index: i + 1
                        };
                    })
                    .filter(Boolean);
                if (points.length > 0) tracks.push(points);
            });
        });

        return tracks;
    }

    displayOnMap(tracks, fileName) {
        this.initMap();
        this.clearTrackLayer();
        const stats = this.calculateStats(tracks);
        this.renderTracks(tracks, fileName, stats);
        this.updateDisplay(fileName, stats);
        this.fitMapBounds(tracks);
        this.saveData();
    }

    initMap() {
        if (!this.map) {
            this.map = L.map('map').setView([43.7274865, 12.6362318], 5);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(this.map);
        }
    }

    clearTrackLayer() {
        if (this.trackLayer) {
            this.map.removeLayer(this.trackLayer);
        }
        this.trackLayer = L.layerGroup().addTo(this.map);
    }

    calculateStats(tracks) {
        let totalDistance = 0, totalElevation = 0, totalPoints = 0;
        let startTime = null, endTime = null;

        tracks.forEach(track => {
            totalPoints += track.length;
            
            for (let i = 1; i < track.length; i++) {
                totalDistance += this.haversineDistance(track[i-1], track[i]);
                
                if (track[i-1].ele !== null && track[i].ele !== null) {
                    const elevDiff = track[i].ele - track[i-1].ele;
                    if (elevDiff > 0) totalElevation += elevDiff;
                }
            }

            const times = track.filter(p => p.time).map(p => p.time);
            if (times.length > 0) {
                const trackStart = new Date(Math.min(...times));
                const trackEnd = new Date(Math.max(...times));
                if (!startTime || trackStart < startTime) startTime = trackStart;
                if (!endTime || trackEnd > endTime) endTime = trackEnd;
            }
        });

        const duration = startTime && endTime ? 
            this.formatDuration(endTime - startTime) : 'N/D';

        return { totalPoints, totalDistance, totalElevation, duration };
    }

    renderTracks(tracks, fileName, stats) {
        tracks.forEach((track, i) => {
            const color = this.colors[i % this.colors.length];
            const latLngs = track.map(p => [p.lat, p.lon]);
            
            const polyline = L.polyline(latLngs, {
                color,
                weight: 4,
                opacity: 0.8
            }).addTo(this.trackLayer);

            polyline.bindPopup(`
                <div>
                    <h4 style="margin: 0 0 10px 0; color: ${color};">🛤️ ${fileName}</h4>
                    <p><strong>Punti:</strong> ${track.length}</p>
                    <p><strong>Distanza:</strong> ${stats.totalDistance.toFixed(2)} km</p>
                    <p><strong>Dislivello+:</strong> ${Math.round(stats.totalElevation)} m</p>
                </div>
            `);
        });
    }

    updateDisplay(fileName, stats) {
        this.addToSummary({ fileName, ...stats });
        this.updateStats(stats);
        this.showSections();
    }

    addToSummary(data) {
        const existingIndex = this.summaryData.findIndex(item => item.fileName === data.fileName);
        
        if (existingIndex === -1) {
            this.summaryData.push(data);
        } else {
            this.summaryData[existingIndex] = data;
        }
        
        this.updateSummaryTable();
    }

    updateSummaryTable() {
        const tbody = document.getElementById('summaryTableBody');
        tbody.innerHTML = this.summaryData.map(data => `
            <tr>
                <td><strong>${data.fileName}</strong></td>
                <td>${data.totalPoints}</td>
                <td>${data.totalDistance.toFixed(2)}</td>
                <td>${Math.round(data.totalElevation)}</td>
                <td>${data.duration}</td>
            </tr>
        `).join('');
    }

    updateStats({ totalPoints, totalDistance, totalElevation, duration }) {
        document.getElementById('totalPoints').textContent = totalPoints;
        document.getElementById('distance').textContent = totalDistance.toFixed(2);
        document.getElementById('elevation').textContent = Math.round(totalElevation);
        document.getElementById('duration').textContent = duration;
    }

    showSections() {
        ['mapContainer', 'stats', 'summarySection', 'clearBtn'].forEach(id => {
            const el = document.getElementById(id);
            el.style.display = id === 'clearBtn' ? 'inline-block' : 
                                id === 'stats' ? 'grid' : 'block';
        });
        
        setTimeout(() => this.map?.invalidateSize(), 100);
    }

    fitMapBounds(tracks) {
        const allPoints = tracks.flat().map(p => [p.lat, p.lon]);
        if (allPoints.length > 0) {
            this.map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] });
        }
    }

    haversineDistance(p1, p2) {
        const R = 6371;
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lon - p1.lon) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 + 
                    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
                    Math.sin(dLon/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    formatDuration(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return hours > 0 ? `${hours}h ${minutes}m` :
                minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }

    clearReport() {
        if (!confirm('Sei sicuro di voler cancellare tutto il report?')) return;
        
        this.summaryData = [];
        this.updateSummaryTable();
        
        ['summarySection', 'clearBtn'].forEach(id => {
            document.getElementById(id).style.display = 'none';
        });
        
        this.clearSavedData();
        this.showMessage('Report cancellato con successo', 'success');
    }

    saveData() {
        window.gpxReportData = this.summaryData;
    }

    loadSavedData() {
        if (window.gpxReportData?.length > 0) {
            this.summaryData = window.gpxReportData;
            this.updateSummaryTable();
            ['summarySection', 'clearBtn'].forEach(id => {
                const el = document.getElementById(id);
                el.style.display = id === 'clearBtn' ? 'inline-block' : 'block';
            });
        }
    }

    clearSavedData() {
        delete window.gpxReportData;
    }

    showMessage(text, type) {
        const msg = document.getElementById('message');
        msg.textContent = text;
        msg.className = `message ${type}`;
        msg.style.display = 'block';
        setTimeout(() => msg.style.display = 'none', 3000);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => new GPXViewer());