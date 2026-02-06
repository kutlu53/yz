// game.js

// Canvas ve context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Image smoothing kapatıyorum (keskin görüntü için)
ctx.imageSmoothingEnabled = false;
ctx.webkitImageSmoothingEnabled = false;
ctx.mozImageSmoothingEnabled = false;
ctx.oImageSmoothingEnabled = false;
ctx.msImageSmoothingEnabled = false;

// Canvas boyutu
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Canvas ayarları
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.oImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Oyun parametreleri
const ROAD_WIDTH = 200;
const LANE_WIDTH = ROAD_WIDTH / 2;
const CAR_WIDTH = 40;
const CAR_HEIGHT = 60;
const BASE_SPEED = 2;
const MAX_SPEED = 3;
const MIN_SPEED = 0.2;

// Yaya geçidi parametreleri
const CROSSWALK_INITIAL_Y = -800; // Başlangıçta yaya geçidinin y konumu (ekranın yukarısında)
const CROSSWALK_VISIBLE_DISTANCE = 800; // Yaya geçidi ne zaman görünür
const CROSSWALK_SLOWDOWN_DISTANCE = 600; // Yavaşlama başlama mesafesi
const CROSSWALK_WIDTH = ROAD_WIDTH;
const CROSSWALK_TRIGGERED_DISTANCE = 100; // Karar seçeneği gösterilmesi

// 2. Yaya geçidi parametreleri
const CROSSWALK2_INITIAL_Y = -100; // 2. geçidi ekranın üstünde başlat
const CROSSWALK2_DELAY = 3000; // 1. geçidi geçtikten 3 saniye sonra başlasın

// Yayalar
class Pedestrian {
    constructor(x, type, crosswalkSection) {
        this.x = x;
        this.y = 0; // Dinamik olarak game.crosswalkY'den hesaplanacak
        this.type = type; // 'oldMale', 'oldFemale', 'adultMale', 'adultFemale', 'child'
        this.crosswalkSection = crosswalkSection; // 0 = kurallı, 1 = kural ihlali
        this.width = 8;
        this.height = 20;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Baş
        ctx.fillStyle = this.getHeadColor();
        ctx.beginPath();
        ctx.arc(0, -10, 5, 0, Math.PI * 2);
        ctx.fill();

        // Gövde
        ctx.fillStyle = this.getBodyColor();
        ctx.fillRect(-4, 0, 8, 14);

        // Bacaklar
        ctx.fillStyle = '#333333';
        ctx.fillRect(-5, 14, 3, 6);
        ctx.fillRect(2, 14, 3, 6);

        ctx.restore();
    }

    getHeadColor() {
        if (this.type === 'child') return '#F5A08D';
        return '#D4A574';
    }

    getBodyColor() {
        switch(this.type) {
            case 'oldMale': return '#2C3E50';      // Koyu gri-mavi
            case 'oldFemale': return '#E74C3C';    // Parlak kırmızı
            case 'adultMale': return '#3498DB';    // Açık mavi
            case 'adultFemale': return '#D946EF';  // Mor
            case 'child': return '#F59E0B';        // Turuncu
            default: return '#808080';
        }
    }
}

// Oyun durumu - Canvas boyutlandırıldıktan sonra
const game = {
    carX: 0, // Başlangıçta 0, oyun döngüsünde güncellenecek
    carY: 0, // Başlangıçta 0, oyun döngüsünde güncellenecek
    carLane: 1, // 0 = sol şerit, 1 = sağ şerit
    targetLane: 1,
    speed: BASE_SPEED,
    distance: 0,
    roadOffset: 0,
    pedestrians: [],
    crosswalkTriggered: false,
    decisionWindowOpen: false,
    distanceToCrosswalk: 0,
    crosswalkEncountered: false,
    decision: null, // 'left' (kurallı), 'right' (risky), null
    crosswalkY: CROSSWALK_INITIAL_Y, // Yaya geçidinin dinamik Y konumu
    timeSlowFactor: 1, // Zaman yavaşlama faktörü (1 = normal, 0 = durdurmuş)
    selectedLane: null, // Yaya geçidinde hangi şeritte olduğu (0 = sol, 1 = sağ)
    crosswalkNumber: 1, // Hanç yaya geçidinde olduğu (1, 2, 3, ...)
    crosswalkDecisions: [], // Her yaya geçidindeki kararları saklar [{number, lane, decision}, ...]
    
    // Tüm geçitler için Y konumları ve state'ler
    crosswalk2Y: CROSSWALK2_INITIAL_Y,
    crosswalk2Triggered: false,
    secondCrosswalkStartTime: null,
    
    crosswalk3Y: -100,
    crosswalk3Triggered: false,
    crosswalk3StartTime: null,
    
    crosswalk4Y: -100,
    crosswalk4Triggered: false,
    crosswalk4StartTime: null,
    
    crosswalk5Y: -100,
    crosswalk5Triggered: false,
    crosswalk5StartTime: null,
    
    crosswalk6Y: -100,
    crosswalk6Triggered: false,
    crosswalk6StartTime: null,
    
    // Bitiş çizgisi
    finishLineY: -100,
    finishLineStartTime: null,
    gameFinished: false
};

// Girdiler
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    if (game.decisionWindowOpen) {
        // Bu geçit için zaten karar verildiyse yoksay
        const alreadyDecided = game.crosswalkDecisions.some(d => d.number === game.crosswalkNumber);
        
        if (e.key === 'ArrowLeft' && !alreadyDecided) {
            game.targetLane = 0; // Sol şerit seç (kurallı)
            game.decision = 'left';
            game.decisionWindowOpen = false;
            // Karar hafızaya kaydet
            game.crosswalkDecisions.push({
                number: game.crosswalkNumber,
                lane: game.selectedLane,
                decision: 'left'
            });
            e.preventDefault();
        }
        if (e.key === 'ArrowRight' && !alreadyDecided) {
            game.targetLane = 1; // Sağ şerit seç (risky)
            game.decision = 'right';
            game.decisionWindowOpen = false;
            // Karar hafızaya kaydet
            game.crosswalkDecisions.push({
                number: game.crosswalkNumber,
                lane: game.selectedLane,
                decision: 'right'
            });
            e.preventDefault();
        }
    } else {
        if (e.key === 'ArrowLeft') {
            if (game.targetLane > 0) {
                game.targetLane--;
            }
        }
        if (e.key === 'ArrowRight') {
            if (game.targetLane < 1) {
                game.targetLane++;
            }
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// MOBIL KONTROLLER - Touch Events
let touchStartX = 0;
let touchEndX = 0;
let touchStartY = 0;
let touchEndY = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, false);

document.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    
    // Karar penceresi açıksa, dokunma pozisyonuna göre seçim yap
    if (game.decisionWindowOpen) {
        handleTapDecision(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    } else {
        handleSwipe();
    }
}, false);

// Dokunma ile karar seçimi (kutucuklara dokunma)
function handleTapDecision(tapX, tapY) {
    const swipeThreshold = 30;
    const diffX = Math.abs(touchStartX - touchEndX);
    const diffY = Math.abs(touchStartY - touchEndY);
    
    // Eğer kaydırma (swipe) yapıldıysa, kaydırma işlemini kullan
    if (diffX > swipeThreshold || diffY > swipeThreshold) {
        handleSwipe();
        return;
    }
    
    // Bu geçit için zaten karar verildiyse yoksay
    const alreadyDecided = game.crosswalkDecisions.some(d => d.number === game.crosswalkNumber);
    if (alreadyDecided) return;
    
    // Dokunma (tap) - ekranın sol veya sağ yarısına göre karar ver
    const screenCenterX = window.innerWidth / 2;
    
    if (tapX < screenCenterX) {
        // Sol tarafa dokunuldu - Sol seçim
        game.targetLane = 0;
        game.decision = 'left';
        game.decisionWindowOpen = false;
        game.crosswalkDecisions.push({
            number: game.crosswalkNumber,
            lane: game.selectedLane,
            decision: 'left'
        });
    } else {
        // Sağ tarafa dokunuldu - Sağ seçim
        game.targetLane = 1;
        game.decision = 'right';
        game.decisionWindowOpen = false;
        game.crosswalkDecisions.push({
            number: game.crosswalkNumber,
            lane: game.selectedLane,
            decision: 'right'
        });
    }
}

function handleSwipe() {
    const swipeThreshold = 50; // Minimum swipe mesafesi
    const diff = touchStartX - touchEndX;

    if (game.gameFinished && Math.abs(diff) > swipeThreshold) {
        // Oyun bittiğinde Enter tuşu ile aynı işlev
        showResults();
        return;
    }

    // Karar penceresi açıkken kaydırma ile de seçim yapılabilir
    if (game.decisionWindowOpen && Math.abs(diff) > swipeThreshold) {
        // Bu geçit için zaten karar verildiyse yoksay
        const alreadyDecided = game.crosswalkDecisions.some(d => d.number === game.crosswalkNumber);
        if (alreadyDecided) return;
        
        if (diff > 0) {
            // Sola kaydırma = Sol seçim
            game.targetLane = 0;
            game.decision = 'left';
            game.decisionWindowOpen = false;
            game.crosswalkDecisions.push({
                number: game.crosswalkNumber,
                lane: game.selectedLane,
                decision: 'left'
            });
        } else {
            // Sağa kaydırma = Sağ seçim
            game.targetLane = 1;
            game.decision = 'right';
            game.decisionWindowOpen = false;
            game.crosswalkDecisions.push({
                number: game.crosswalkNumber,
                lane: game.selectedLane,
                decision: 'right'
            });
        }
    } else if (!game.decisionWindowOpen && Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Sola kaydırma = Sol şerit
            if (game.targetLane > 0) {
                game.targetLane--;
            }
        } else {
            // Sağa kaydırma = Sağ şerit
            if (game.targetLane < 1) {
                game.targetLane++;
            }
        }
    }
}

// Araba pozisyonunu güncelle
function updateCarPosition() {
    // İlk kez çalıştığında araba konumunu ayarla
    if (game.carY === 0) {
        game.carY = canvas.height * 0.75;
    }
    if (game.carX === 0) {
        game.carX = canvas.width / 2;
    }

    // Arabanın Y konumu sabit (yol içinde)
    game.carY = canvas.height * 0.75;

    // Hedef şeride doğru hareket et (X konumu)
    const roadCenterX = canvas.width / 2;
    const targetX = roadCenterX - ROAD_WIDTH / 2 + game.targetLane * LANE_WIDTH + LANE_WIDTH / 2;
    const laneChangeSpeed = 3;

    if (game.carX < targetX - 1) {
        game.carX += laneChangeSpeed;
    } else if (game.carX > targetX + 1) {
        game.carX -= laneChangeSpeed;
    } else {
        game.carX = targetX;
        game.carLane = game.targetLane;
    }
}

// Yaya geçidini oluştur
function createCrosswalk() {
    game.pedestrians = [];
    game.crosswalkEncountered = true;

    const roadCenterX = canvas.width / 2;

    // Section 0: Kurallara uygun yayalar (sol taraf)
    // 2 yaşlı erkek
    game.pedestrians.push(new Pedestrian(roadCenterX - 60, 'oldMale', 0));
    game.pedestrians.push(new Pedestrian(roadCenterX - 40, 'oldMale', 0));
    // 1 yaşlı kadın
    game.pedestrians.push(new Pedestrian(roadCenterX - 20, 'oldFemale', 0));
    // 1 erkek
    game.pedestrians.push(new Pedestrian(roadCenterX + 0, 'adultMale', 0));

    // Section 1: Kural ihlali yapan yayalar (sağ taraf)
    // 2 erkek
    game.pedestrians.push(new Pedestrian(roadCenterX + 40, 'adultMale', 1));
    game.pedestrians.push(new Pedestrian(roadCenterX + 60, 'adultMale', 1));
    // 1 kadın
    game.pedestrians.push(new Pedestrian(roadCenterX + 80, 'adultFemale', 1));
    // 1 çocuk
    game.pedestrians.push(new Pedestrian(roadCenterX + 100, 'child', 1));
}

// Yaya sınıfını güncelle - Y pozisyonunu dinamik yapmak için
class PedestrianDynamic extends Pedestrian {
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, game.crosswalkY + 20); // game.crosswalkY'yi kullan

        // Baş
        ctx.fillStyle = this.getHeadColor();
        ctx.beginPath();
        ctx.arc(0, -10, 5, 0, Math.PI * 2);
        ctx.fill();

        // Gövde
        ctx.fillStyle = this.getBodyColor();
        ctx.fillRect(-4, 0, 8, 14);

        // Bacaklar
        ctx.fillStyle = '#333333';
        ctx.fillRect(-5, 14, 3, 6);
        ctx.fillRect(2, 14, 3, 6);

        ctx.restore();
    }
}

// Hızı güncelle
function updateSpeed() {
    // Sadece 1. geçidi kontrol et
    if (game.crosswalkNumber !== 1) {
        // 2. ve sonraki geçitlerin hızı kontrol edilmek için yer açalım
        return;
    }
    
    // Yaya geçidine uzaklık hesapla (ekrandan yaya geçidine kadar)
    const distanceToCrosswalk = game.crosswalkY - game.carY;
    game.distanceToCrosswalk = distanceToCrosswalk;

    // Yaya geçidi ekrana girdiğinde trigger et (y = 0'dan başladığında)
    if (game.crosswalkY >= 0 && game.crosswalkY < canvas.height && !game.crosswalkTriggered) {
        game.crosswalkTriggered = true;
        createCrosswalk();
    }

    // Karar penceresini aç
    if (distanceToCrosswalk < CROSSWALK_TRIGGERED_DISTANCE && distanceToCrosswalk > 0 && !game.decisionWindowOpen && game.decision === null) {
        game.decisionWindowOpen = true;
    }

    // Yaya geçidi ekrana girince - hemen karar penceresini aç
    if (game.crosswalkY >= 0 && game.crosswalkY < canvas.height) {
        // Yaya geçidi ekranda

        // Karar penceresini aç (ekrana girince hemen) - sadece kapalıysa
        if (!game.decisionWindowOpen && game.decision === null) {
            game.decisionWindowOpen = true;
            game.selectedLane = game.carLane; // Karar esnasında araç hangi şeritte varsa kaydet
        }

        // Pencere açıkken VEYA karar verilmemişken hız yavaşla
        if (game.decisionWindowOpen && game.decision === null) {
            game.speed = BASE_SPEED * 0.3; // Yavaşla (durmak yerine)
        } else if (game.decision !== null) {
            // Karar verildikten sonra normal hızla devam et
            game.speed = BASE_SPEED;
        }

        game.timeSlowFactor = 1;
    } else if (game.crosswalkY < 0) {
        // Yaya geçidi henüz ekrana girmedi - normal hız
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
    } else if (game.crosswalkY >= canvas.height) {
        // 1. Yaya geçidi geçildi - 2. geçidiyi başlatma saati kaydet
        if (game.secondCrosswalkStartTime === null) {
            game.secondCrosswalkStartTime = Date.now();
            
            // Eğer karar verilmediyse, aracın şeridine göre otomatik karar kaydet
            const alreadyDecided = game.crosswalkDecisions.some(d => d.number === 1);
            if (!alreadyDecided) {
                const autoDecision = game.carLane === 0 ? 'left' : 'right';
                game.crosswalkDecisions.push({
                    number: 1,
                    lane: game.carLane,
                    decision: autoDecision
                });
            }
        }
        game.crosswalkTriggered = false;
        game.crosswalkEncountered = false;
        game.decision = null;
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
        game.decisionWindowOpen = false; // Karar penceresini kapat
        game.selectedLane = null; // Seçilen şeriti sıfırla
        game.crosswalkNumber++; // Sonraki yaya geçidine hazırlan
    }
    
    // 2. Yaya geçidini 3 saniye sonra harekete geçir
    // NOT: Bu hareket artık gameLoop içinde frameMultiplier ile yapılıyor

    // Hızı sınırla
    game.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, game.speed));
}

// Yolu çiz
function drawRoad() {
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;

    const roadX = Math.round(canvas.width / 2 - ROAD_WIDTH / 2);

    // Debug ilk çağrı
    if (game.distance === 0) {
        console.log('Yol çiziliyor - roadX:', roadX, 'ROAD_WIDTH:', ROAD_WIDTH);
    }

    // Yol arka planı
    ctx.fillStyle = '#333333';
    ctx.fillRect(roadX, 0, ROAD_WIDTH, canvas.height);

    // Orta çizgi (kesintili - fillRect)
    ctx.fillStyle = '#FFFF00';

    const dashLength = 30;
    const gapLength = 20;
    const totalLength = dashLength + gapLength;
    const offset = Math.round((game.roadOffset) % totalLength);

    for (let y = 0; y < canvas.height; y += totalLength) {
        ctx.fillRect(roadX + Math.round(LANE_WIDTH) - 2, y + offset, 4, dashLength);
    }

    // Yol kenarları - sol
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(roadX - 3, 0, 3, canvas.height);

    // Yol kenarları - sağ
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(roadX + ROAD_WIDTH, 0, 3, canvas.height);

    // Yaya geçidi çiz
    const crosswalkX = roadX;
    const crosswalkWidth = ROAD_WIDTH;

    if (game.crosswalkY < canvas.height && game.crosswalkY > -50) {
        // Yaya geçidi deseni
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        const stripeWidth = 15;
        for (let i = 0; i < crosswalkWidth; i += stripeWidth * 2) {
            ctx.fillRect(Math.round(crosswalkX + i), Math.round(game.crosswalkY), stripeWidth, 40);
        }
    }
}

// Arabayı çiz - Kuşbakışı perspektif
function drawCar() {
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;

    const x = game.carX;
    const y = game.carY;
    const w = 40; // Genişlik
    const h = 60; // Yükseklik

    // Araba gövdesi (kırmızı)
    ctx.fillStyle = '#E63946';
    ctx.fillRect(x - w/2, y - h/2, w, h);

    // Ön cam (mavi)
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(x - w/2 + 3, y - h/2 + 3, w - 6, 12);

    // Arka cam (gri)
    ctx.fillStyle = '#B0B0B0';
    ctx.fillRect(x - w/2 + 3, y + h/2 - 15, w - 6, 12);

    // Ön sol tekerlek (koyu gri)
    ctx.fillStyle = '#2C2C2C';
    ctx.fillRect(x - w/2 - 3, y - h/2 - 2, 6, 8);

    // Ön sağ tekerlek (koyu gri)
    ctx.fillRect(x + w/2 - 3, y - h/2 - 2, 6, 8);

    // Arka sol tekerlek (koyu gri)
    ctx.fillRect(x - w/2 - 3, y + h/2 - 6, 6, 8);

    // Arka sağ tekerlek (koyu gri)
    ctx.fillRect(x + w/2 - 3, y + h/2 - 6, 6, 8);
}

// Yayaları çiz
function drawPedestrians() {
    // Araç geçidi geçtiyse yayaları çizme
    if (game.crosswalkNumber > 1) return;
    
    // Yayaları yaya geçidinin dinamik Y konumunda çiz
    for (let pedestrian of game.pedestrians) {
        // Yayaları ekrana görünür alanında çiz
        if (game.crosswalkY < canvas.height + 50 && game.crosswalkY > -50) {
            drawPedestrianFigure(pedestrian);
        }
    }
}

// Yaya figürü çiz
function drawPedestrianFigure(pedestrian) {
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;

    const x = pedestrian.x;
    const y = game.crosswalkY + 20;

    if (pedestrian.type === 'child') {
        // Çocuk - turuncu, küçük
        drawChild(x, y);
    } else if (pedestrian.type === 'oldFemale') {
        // Yaşlı kadın - kırmızı, değnek
        drawOldWoman(x, y);
    } else if (pedestrian.type === 'oldMale') {
        // Yaşlı erkek - koyu gri
        drawOldMan(x, y);
    } else if (pedestrian.type === 'adultFemale') {
        // Yetişkin kadın - mor
        drawAdultWoman(x, y);
    } else {
        // Yetişkin erkek - mavi
        drawAdultMan(x, y);
    }
}

// Çocuk figürü
function drawChild(x, y) {
    ctx.fillStyle = '#F59E0B'; // Turuncu

    // Baş
    ctx.beginPath();
    ctx.arc(x, y - 12, 5, 0, Math.PI * 2);
    ctx.fill();

    // Gövde
    ctx.fillRect(x - 4, y - 5, 8, 10);

    // Bacaklar
    ctx.fillRect(x - 3, y + 5, 2, 6);
    ctx.fillRect(x + 1, y + 5, 2, 6);
}

// Yaşlı kadın figürü
function drawOldWoman(x, y) {
    ctx.fillStyle = '#E74C3C'; // Kırmızı

    // Baş (gri saç göstermek için)
    ctx.fillStyle = '#D4A574';
    ctx.beginPath();
    ctx.arc(x, y - 14, 6, 0, Math.PI * 2);
    ctx.fill();

    // Gövde
    ctx.fillStyle = '#E74C3C';
    ctx.fillRect(x - 5, y - 3, 10, 12);

    // Bacaklar (ince)
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(x - 4, y + 9, 2, 6);
    ctx.fillRect(x + 2, y + 9, 2, 6);

    // Değnek
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 5);
    ctx.lineTo(x + 7, y + 15);
    ctx.stroke();
}

// Yaşlı erkek figürü
function drawOldMan(x, y) {
    ctx.fillStyle = '#D4A574'; // Cilt rengi

    // Baş
    ctx.beginPath();
    ctx.arc(x, y - 14, 6, 0, Math.PI * 2);
    ctx.fill();

    // Gövde (koyu gri)
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(x - 5, y - 3, 10, 12);

    // Bacaklar
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 4, y + 9, 2, 6);
    ctx.fillRect(x + 2, y + 9, 2, 6);
}

// Yetişkin kadın figürü
function drawAdultWoman(x, y) {
    ctx.fillStyle = '#D4A574'; // Cilt rengi

    // Baş
    ctx.beginPath();
    ctx.arc(x, y - 14, 6, 0, Math.PI * 2);
    ctx.fill();

    // Gövde (mor)
    ctx.fillStyle = '#D946EF';
    ctx.fillRect(x - 5, y - 3, 10, 12);

    // Bacaklar
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 4, y + 9, 2, 6);
    ctx.fillRect(x + 2, y + 9, 2, 6);
}

// Yetişkin erkek figürü
function drawAdultMan(x, y) {
    ctx.fillStyle = '#D4A574'; // Cilt rengi

    // Baş
    ctx.beginPath();
    ctx.arc(x, y - 14, 6, 0, Math.PI * 2);
    ctx.fill();

    // Gövde (mavi)
    ctx.fillStyle = '#3498DB';
    ctx.fillRect(x - 5, y - 3, 10, 12);

    // Bacaklar
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 4, y + 9, 2, 6);
    ctx.fillRect(x + 2, y + 9, 2, 6);
}

// 2. Yaya geçidini çiz (hayvanlar ve insanlar)
function drawSecondCrosswalk() {
    // Araç yaya geçidine temas ettiyse çizme
    if (game.crosswalkNumber > 2) return;
    if (game.crosswalk2Y > canvas.height + 100) return; // Ekranın altında çizme
    
    const roadX = Math.round(canvas.width / 2 - ROAD_WIDTH / 2);
    
    // Yaya geçidi deseni (ince çizgiler)
    if (game.crosswalk2Y < canvas.height && game.crosswalk2Y > -50) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        const stripeWidth = 15;
        for (let i = 0; i < ROAD_WIDTH; i += stripeWidth * 2) {
            ctx.fillRect(Math.round(roadX + i), Math.round(game.crosswalk2Y), stripeWidth, 40);
        }
    }
    
    // 2. geçidinin karakterleri (hayvanlar ve insanlar)
    if (game.crosswalk2Y < canvas.height && game.crosswalk2Y > -100) {
        ctx.imageSmoothingEnabled = false;
        const centerX = canvas.width / 2;
        const yPos = game.crosswalk2Y + 20;
        
        // Sol taraf: 3 kedi ve 2 köpek (hayvanlar)
        // Kediler - sarı/turuncu, küçük
        drawCat(centerX - 75, yPos);
        drawCat(centerX - 50, yPos);
        drawCat(centerX - 25, yPos);
        
        // Köpekler - kahverengi, biraz daha büyük
        drawDog(centerX + 5, yPos);
        drawDog(centerX + 30, yPos);
        
        // Sağ taraf: 2 iri kadın, 2 erkek yönetici, 1 evsiz (insanlar)
        // 2 iri kadın (lila elbise, daha geniş)
        drawLargeWoman(centerX + 55, yPos);
        drawLargeWoman(centerX + 80, yPos);
        
        // 2 erkek yönetici (mavi takım)
        drawExecutive(centerX - 10, yPos);
        drawExecutive(centerX + 15, yPos);
        
        // 1 evsiz kişi (gri, kirli)
        drawHomeless(centerX - 40, yPos);
    }
}

// Kedi figürü
function drawCat(x, y) {
    ctx.fillStyle = '#F59E0B'; // Turuncu
    
    // Baş
    ctx.beginPath();
    ctx.arc(x, y - 10, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Kulaklar (üçgen)
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 14);
    ctx.lineTo(x - 1, y - 10);
    ctx.lineTo(x - 2, y - 12);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 14);
    ctx.lineTo(x + 1, y - 10);
    ctx.lineTo(x + 2, y - 12);
    ctx.fill();
    
    // Gövde (kısa)
    ctx.fillRect(x - 3, y - 5, 6, 8);
}

// Köpek figürü
function drawDog(x, y) {
    ctx.fillStyle = '#92400E'; // Kahverengi
    
    // Baş (daha büyük)
    ctx.beginPath();
    ctx.arc(x, y - 11, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Kulaklar (aşağı doğru)
    ctx.fillRect(x - 4, y - 11, 2, 4);
    ctx.fillRect(x + 2, y - 11, 2, 4);
    
    // Gövde
    ctx.fillRect(x - 4, y - 4, 8, 9);
}

// Iri kadın figürü
function drawLargeWoman(x, y) {
    ctx.fillStyle = '#D4A574'; // Cilt rengi
    
    // Baş
    ctx.beginPath();
    ctx.arc(x, y - 15, 7, 0, Math.PI * 2);
    ctx.fill();
    
    // Gövde (geniş, mor elbise)
    ctx.fillStyle = '#D946EF';
    ctx.fillRect(x - 8, y - 3, 16, 14);
    
    // Bacaklar
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 6, y + 11, 3, 6);
    ctx.fillRect(x + 3, y + 11, 3, 6);
}

// Yönetici erkek figürü
function drawExecutive(x, y) {
    ctx.fillStyle = '#D4A574'; // Cilt rengi
    
    // Baş
    ctx.beginPath();
    ctx.arc(x, y - 14, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Gövde (mavi takım)
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(x - 5, y - 3, 10, 13);
    
    // Bacaklar (siyah)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 4, y + 10, 2, 6);
    ctx.fillRect(x + 2, y + 10, 2, 6);
}

// Evsiz kişi figürü
function drawHomeless(x, y) {
    ctx.fillStyle = '#6B7280'; // Gri, kirli görünüm
    
    // Baş (açık kafa - şapka yok)
    ctx.beginPath();
    ctx.arc(x, y - 13, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Gövde (yıpranmış, geniş elbise)
    ctx.fillStyle = '#4B5563';
    ctx.fillRect(x - 6, y - 2, 12, 13);
    
    // Bacaklar (yıpranmış)
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(x - 5, y + 11, 3, 6);
    ctx.fillRect(x + 2, y + 11, 3, 6);
}

// Karar penceresini çiz - Etik dilemma (sade / şık tasarım)
function drawDecisionWindow() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const isMobile = canvas.width < 600;

    // Arka plan karartma
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Başlık
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#ffffff';
    const titleSize = isMobile ? Math.max(20, canvas.width * 0.06) : 34;
    ctx.font = `600 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText('Otonom Araç   Fren Arızası', cx, cy - 200);

    ctx.fillStyle = '#d1d5db';
    const subtitleSize = isMobile ? Math.max(14, canvas.width * 0.04) : 18;
    ctx.font = `${subtitleSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText('Araç duramıyor. Bir karar vermelisin.', cx, cy - 160);

    // Kart ölçüleri (ekrana göre)
    let cardW, cardH, gap;
    if (isMobile) {
        cardW = Math.min(canvas.width * 0.45, 280);
        cardH = Math.min(canvas.height * 0.35, 250);
        gap = canvas.width * 0.04;
    } else {
        cardW = Math.min(520, Math.max(320, canvas.width * 0.32));
        cardH = 300;
        gap = Math.min(100, Math.max(40, canvas.width * 0.06));
    }

    drawChoiceCard(
        cx - cardW - gap / 2,
        cy - cardH / 2,
        cardW,
        cardH,
        'Sol Taraf',
        'Kurallara uyan yayalar',
        ['👴 👴 2 yaşlı erkek', '👵 1 yaşlı kadın', '👨 1 yetişkin erkek'],
        '#16a34a',
        isMobile
    );

    drawChoiceCard(
        cx + gap / 2,
        cy - cardH / 2,
        cardW,
        cardH,
        'Sağ Taraf',
        'Kural ihlali yapanlar',
        ['👨 👨 2 erkek', '👩 1 kadın', '👧 1 çocuk'],
        '#dc2626',
        isMobile
    );

    // Alt ipucu
    ctx.fillStyle = '#9ca3af';
    const hintSize = isMobile ? Math.max(12, canvas.width * 0.03) : 15;
    ctx.font = `${hintSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText('⬅ Sol / Sağ ➡ ile seçim yap', cx, cy + 220);
}

// 2. Yaya geçidini kontrol et (1. geçidi gibi)
function updateSecondCrosswalk() {
    // 2. geçidi sadece 1. geçidi geçtikten sonra kontrol et
    if (game.crosswalkNumber !== 2) return;
    
    // 2. geçidi tetikle
    if (game.crosswalk2Y >= 0 && game.crosswalk2Y < canvas.height && !game.crosswalk2Triggered) {
        game.crosswalk2Triggered = true;
    }
    
    // 2. geçidi ekrana girince - hemen karar penceresini aç
    if (game.crosswalk2Y >= 0 && game.crosswalk2Y < canvas.height) {
        // Karar penceresini aç (ekrana girince hemen) - sadece kapalıysa
        if (!game.decisionWindowOpen && game.decision === null) {
            game.decisionWindowOpen = true;
            game.selectedLane = game.carLane; // Karar esnasında araç hangi şeritte varsa kaydet
        }

        // Pencere açıkken VEYA karar verilmemişken hız yavaşla
        if (game.decisionWindowOpen && game.decision === null) {
            game.speed = BASE_SPEED * 0.3; // Yavaşla
        } else if (game.decision !== null) {
            // Karar verildikten sonra normal hızla devam et
            game.speed = BASE_SPEED;
        }

        game.timeSlowFactor = 1;
    } else if (game.crosswalk2Y < 0) {
        // Yaya geçidi henüz ekrana girmedi - normal hız
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
    } else if (game.crosswalk2Y >= canvas.height) {
        // 2. Yaya geçidi geçildi - otomatik karar kaydet
        const alreadyDecided = game.crosswalkDecisions.some(d => d.number === 2);
        if (!alreadyDecided) {
            const autoDecision = game.carLane === 0 ? 'left' : 'right';
            game.crosswalkDecisions.push({
                number: 2,
                lane: game.carLane,
                decision: autoDecision
            });
        }
        game.crosswalk2Triggered = false;
        game.decision = null;
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
        game.decisionWindowOpen = false; // Karar penceresini kapat
        game.selectedLane = null; // Seçilen şeriti sıfırla
        game.crosswalkNumber++; // Sonraki yaya geçidine hazırlan
    }
}

// 2. Yaya geçidi karar penceresini çiz
function drawGenericDecisionWindow(leftTitle, leftSubtitle, leftList, leftColor, rightTitle, rightSubtitle, rightList, rightColor) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const isMobile = canvas.width < 600;

    // Arka plan karartma
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Başlık
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#ffffff';
    const titleSize = isMobile ? Math.max(18, canvas.width * 0.05) : 34;
    ctx.font = `600 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    const titleY = isMobile ? cy - 160 : cy - 200;
    ctx.fillText('Otonom Araç   Fren Arızası', cx, titleY);

    ctx.fillStyle = '#d1d5db';
    const subtitleSize = isMobile ? Math.max(12, canvas.width * 0.035) : 18;
    ctx.font = `${subtitleSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    const subtitleY = isMobile ? cy - 130 : cy - 160;
    ctx.fillText('Araç duramıyor. Bir karar vermelisin.', cx, subtitleY);

    // Kart ölçüleri
    let cardW, cardH, gap, cardY;
    if (isMobile) {
        cardW = Math.min(canvas.width * 0.42, 200);
        cardH = Math.min(canvas.height * 0.3, 180);
        gap = canvas.width * 0.02;
        cardY = cy - 30; // Kartları biraz yukarı
    } else {
        cardW = Math.min(520, Math.max(320, canvas.width * 0.32));
        cardH = 300;
        gap = Math.min(100, Math.max(40, canvas.width * 0.06));
        cardY = cy - cardH / 2;
    }

    drawChoiceCard(
        cx - cardW - gap / 2,
        cardY,
        cardW,
        cardH,
        leftTitle,
        leftSubtitle,
        leftList,
        leftColor,
        isMobile
    );

    drawChoiceCard(
        cx + gap / 2,
        cardY,
        cardW,
        cardH,
        rightTitle,
        rightSubtitle,
        rightList,
        rightColor,
        isMobile
    );

    // Alt ipucu
    ctx.fillStyle = '#9ca3af';
    const hintSize = isMobile ? Math.max(12, canvas.width * 0.03) : 15;
    ctx.font = `${hintSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText('⬅ Sol / Sağ ➡ ile seçim yap', cx, cy + 220);
}

function drawSecondDecisionWindow() {
    drawGenericDecisionWindow(
        'Sol Taraf',
        'Hayvan Hayatı',
        ['🐱 🐱 🐱 3 kedi', '🐕 🐕 2 köpek'],
        '#16a34a',
        'Sağ Taraf',
        'İnsan Hayatı',
        ['👩 👩 2 iri kadın', '👨 👨 2 yönetici', '🧑‍💼 1 evsiz'],
        '#dc2626'
    );
}

// Seçenek kartı çiz (modern card) - Mobile responsive
function drawChoiceCard(x, y, w, h, title, subtitle, list, accent, isMobile = false) {
    // Gölge
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetY = 10;

    // Kart
    ctx.fillStyle = '#111827';
    ctx.fillRect(x, y, w, h);

    ctx.restore();

    // Üst renk şeridi
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, 6);

    // Başlık
    ctx.fillStyle = '#ffffff';
    const titleSize = isMobile ? Math.max(18, w * 0.12) : 26;
    ctx.font = `600 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, y + h * 0.2);

    // Alt başlık
    ctx.fillStyle = '#9ca3af';
    const subtitleSize = isMobile ? Math.max(12, w * 0.08) : 16;
    ctx.font = `${subtitleSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText(subtitle, x + w / 2, y + h * 0.35);

    // Liste
    ctx.fillStyle = '#e5e7eb';
    const listSize = isMobile ? Math.max(12, w * 0.09) : 20;
    ctx.font = `${listSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;

    const startY = y + h * 0.5;
    const lineH = h * 0.2;

    list.forEach((item, i) => {
        ctx.fillText(item, x + w / 2, startY + i * lineH);
    });
}

function drawButton(x, y, width, height, text, color) {
    // Buton arka planı
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);

    // Buton çerçevesi
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // Buton metni
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        ctx.fillText(line, x + width / 2, y + height / 2 + (index - lines.length / 2 + 0.5) * 12);
    });
}

// UI güncelle
function updateUI() {
    const laneNames = ['Sol', 'Sağ'];
    document.getElementById('laneDisplay').textContent = laneNames[game.carLane];
    document.getElementById('speedDisplay').textContent = Math.round(game.speed * 10);
    document.getElementById('distanceDisplay').textContent = Math.round(game.distance);

    const speedPercentage = (game.speed / MAX_SPEED) * 100;
    document.getElementById('speedBar').style.width = speedPercentage + '%';
}

// Delta time için son zaman damgası
let lastFrameTime = 0;
const TARGET_FPS = 60; // Hedef FPS (tüm cihazlarda tutarlı hız için)

// Ana oyun döngüsü
function gameLoop(currentTime) {
    // Delta time hesapla (milisaniye -> saniye)
    if (lastFrameTime === 0) lastFrameTime = currentTime;
    const deltaTime = (currentTime - lastFrameTime) / 1000; // saniye cinsinden
    lastFrameTime = currentTime;
    
    // FPS'den bağımsız hız çarpanı (60 FPS baz alınarak)
    const frameMultiplier = deltaTime * TARGET_FPS;
    
    // Yol hareketini güncelle (FPS bağımsız)
    game.roadOffset += game.speed * game.timeSlowFactor * frameMultiplier;

    // Mesafeyi güncelle
    game.distance += game.speed * frameMultiplier;

    // Yaya geçidini yaklaştır (aşağıya doğru hareket)
    game.crosswalkY += game.speed * game.timeSlowFactor * frameMultiplier;
    
    // 1. geçidi geçtikten sonra 3 saniye sonra 2. geçidi başlat
    if (game.crosswalkNumber === 1 && game.crosswalkY > canvas.height + 50) {
        if (!game.secondCrosswalkStartTime) {
            game.secondCrosswalkStartTime = Date.now();
            game.crosswalk2Y = -100; // 2. geçidi ekranın üstünde başlat
        }
    }
    
    // 2. Yaya geçidini yaklaştır (3 saniye gecikmeli)
    if (game.secondCrosswalkStartTime) {
        const elapsed = Date.now() - game.secondCrosswalkStartTime;
        if (elapsed >= 3000) {
            game.crosswalk2Y += game.speed * game.timeSlowFactor * frameMultiplier;
        }
    }
    
    // 3. Yaya geçidini yaklaştır (2. geçidi geçtikten 3 saniye sonra)
    if (game.crosswalk2Y > canvas.height + 50) {
        if (!game.crosswalk3StartTime) {
            game.crosswalk3StartTime = Date.now();
        }
    }
    if (game.crosswalk3StartTime) {
        const elapsed = Date.now() - game.crosswalk3StartTime;
        if (elapsed >= 3000) {
            game.crosswalk3Y += game.speed * game.timeSlowFactor * frameMultiplier;
        }
    }
    
    // 4. Yaya geçidini yaklaştır
    if (game.crosswalk3Y > canvas.height + 50) {
        if (!game.crosswalk4StartTime) {
            game.crosswalk4StartTime = Date.now();
        }
    }
    if (game.crosswalk4StartTime) {
        const elapsed = Date.now() - game.crosswalk4StartTime;
        if (elapsed >= 3000) {
            game.crosswalk4Y += game.speed * game.timeSlowFactor * frameMultiplier;
        }
    }
    
    // 5. Yaya geçidini yaklaştır
    if (game.crosswalk4Y > canvas.height + 50) {
        if (!game.crosswalk5StartTime) {
            game.crosswalk5StartTime = Date.now();
        }
    }
    if (game.crosswalk5StartTime) {
        const elapsed = Date.now() - game.crosswalk5StartTime;
        if (elapsed >= 3000) {
            game.crosswalk5Y += game.speed * game.timeSlowFactor * frameMultiplier;
        }
    }
    
    // 6. Yaya geçidini yaklaştır
    if (game.crosswalk5Y > canvas.height + 50) {
        if (!game.crosswalk6StartTime) {
            game.crosswalk6StartTime = Date.now();
        }
    }
    if (game.crosswalk6StartTime) {
        const elapsed = Date.now() - game.crosswalk6StartTime;
        if (elapsed >= 3000) {
            game.crosswalk6Y += game.speed * game.timeSlowFactor * frameMultiplier;
        }
    }
    
    // Bitiş çizgisini yaklaştır (6. geçit bittiğinden 3 saniye sonra)
    if (game.crosswalk6Y > canvas.height + 50) {
        if (!game.finishLineStartTime) {
            game.finishLineStartTime = Date.now();
        }
    }
    if (game.finishLineStartTime) {
        const elapsed = Date.now() - game.finishLineStartTime;
        if (elapsed >= 3000) {
            game.finishLineY += game.speed * game.timeSlowFactor * frameMultiplier;
        }
    }

    // Araba pozisyonunu güncelle
    updateCarPosition();

    // Hızı güncelle
    updateSpeed();
    
    // Tüm geçitleri kontrol et
    updateSecondCrosswalk();
    updateThirdCrosswalk();
    updateFourthCrosswalk();
    updateFifthCrosswalk();
    updateSixthCrosswalk();

    // Canvas ayarlarını sıfırla (bulanıklık için)
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;

    // Ekranı temizle - arka planı (gökyüzü)
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Yolu çiz (arka plan üzerine)
    drawRoad();

    // Yayaları çiz
    drawPedestrians();
    
    // Tüm yaya geçitlerini çiz
    drawSecondCrosswalk();
    drawThirdCrosswalk();
    drawFourthCrosswalk();
    drawFifthCrosswalk();
    drawSixthCrosswalk();
    
    // Bitiş çizgisini çiz
    drawFinishLine();

    // Araç çizmeden önce smooth'u devre dışı bırak
    ctx.imageSmoothingEnabled = false;

    // Arabayı çiz
    drawCar();

    // Araba çizdikten sonra da smooth'u devre dışı bırak
    ctx.imageSmoothingEnabled = false;

    // Karar penceresini çiz
    if (game.decisionWindowOpen) {
        if (game.crosswalkNumber === 1) {
            drawDecisionWindow();
        } else if (game.crosswalkNumber === 2) {
            drawSecondDecisionWindow();
        } else if (game.crosswalkNumber === 3) {
            drawThirdDecisionWindow();
        } else if (game.crosswalkNumber === 4) {
            drawFourthDecisionWindow();
        } else if (game.crosswalkNumber === 5) {
            drawFifthDecisionWindow();
        } else if (game.crosswalkNumber === 6) {
            drawSixthDecisionWindow();
        }
    }

    requestAnimationFrame(gameLoop);
}

// 3. YAA GEÇİDİ FONKSIYONLARI
function drawThirdCrosswalk() {
    if (game.crosswalkNumber > 3) return;
    if (game.crosswalk3Y > canvas.height + 100) return;
    
    const roadX = Math.round(canvas.width / 2 - ROAD_WIDTH / 2);
    
    if (game.crosswalk3Y < canvas.height && game.crosswalk3Y > -50) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        const stripeWidth = 15;
        for (let i = 0; i < ROAD_WIDTH; i += stripeWidth * 2) {
            ctx.fillRect(Math.round(roadX + i), Math.round(game.crosswalk3Y), stripeWidth, 40);
        }
    }
    
    if (game.crosswalk3Y < canvas.height && game.crosswalk3Y > -100) {
        ctx.imageSmoothingEnabled = false;
        const centerX = canvas.width / 2;
        const yPos = game.crosswalk3Y + 20;
        
        // Sol: Araç içinde kız çocuk (bariyere çarparsa)
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(centerX - 85, yPos - 8, 25, 15);
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(centerX - 72, yPos - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Sağ: Erkek çocuk
        drawChild(centerX + 60, yPos);
    }
}

function updateThirdCrosswalk() {
    if (game.crosswalkNumber !== 3) return;
    
    if (game.crosswalk3Y >= 0 && game.crosswalk3Y < canvas.height && !game.crosswalk3Triggered) {
        game.crosswalk3Triggered = true;
    }
    
    if (game.crosswalk3Y >= 0 && game.crosswalk3Y < canvas.height) {
        if (!game.decisionWindowOpen && game.decision === null) {
            game.decisionWindowOpen = true;
            game.selectedLane = game.carLane;
        }

        if (game.decisionWindowOpen && game.decision === null) {
            game.speed = BASE_SPEED * 0.3;
        } else if (game.decision !== null) {
            game.speed = BASE_SPEED;
        }

        game.timeSlowFactor = 1;
    } else if (game.crosswalk3Y < 0) {
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
    } else if (game.crosswalk3Y >= canvas.height) {
        // 3. Yaya geçidi geçildi - otomatik karar kaydet
        const alreadyDecided = game.crosswalkDecisions.some(d => d.number === 3);
        if (!alreadyDecided) {
            const autoDecision = game.carLane === 0 ? 'left' : 'right';
            game.crosswalkDecisions.push({
                number: 3,
                lane: game.carLane,
                decision: autoDecision
            });
        }
        game.crosswalk3Triggered = false;
        game.decision = null;
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
        game.decisionWindowOpen = false;
        game.selectedLane = null;
        game.crosswalkNumber++;
    }
}

function drawThirdDecisionWindow() {
    drawGenericDecisionWindow(
        'Sol Taraf',
        'Beton bariyere çarpar',
        ['🚗 Araç içinde', '👧 Kız çocuk zarar görecek'],
        '#e74c3c',
        'Sağ Taraf',
        'Yaya geçidi',
        ['👦 Erkek çocuk zarar görecek'],
        '#3b82f6'
    );
}

// 4. YAA GEÇİDİ FONKSIYONLARI
function drawFourthCrosswalk() {
    if (game.crosswalkNumber > 4) return;
    if (game.crosswalk4Y > canvas.height + 100) return;
    
    const roadX = Math.round(canvas.width / 2 - ROAD_WIDTH / 2);
    
    if (game.crosswalk4Y < canvas.height && game.crosswalk4Y > -50) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        const stripeWidth = 15;
        for (let i = 0; i < ROAD_WIDTH; i += stripeWidth * 2) {
            ctx.fillRect(Math.round(roadX + i), Math.round(game.crosswalk4Y), stripeWidth, 40);
        }
    }
    
    if (game.crosswalk4Y < canvas.height && game.crosswalk4Y > -100) {
        ctx.imageSmoothingEnabled = false;
        const centerX = canvas.width / 2;
        const yPos = game.crosswalk4Y + 20;
        
        drawOldMan(centerX - 70, yPos);
        drawOldMan(centerX - 40, yPos);
        drawOldWoman(centerX - 10, yPos);
        drawChild(centerX + 30, yPos);
        drawChild(centerX + 55, yPos);
        drawAdultMan(centerX + 80, yPos);
    }
}

function updateFourthCrosswalk() {
    if (game.crosswalkNumber !== 4) return;
    
    if (game.crosswalk4Y >= 0 && game.crosswalk4Y < canvas.height && !game.crosswalk4Triggered) {
        game.crosswalk4Triggered = true;
    }
    
    if (game.crosswalk4Y >= 0 && game.crosswalk4Y < canvas.height) {
        if (!game.decisionWindowOpen && game.decision === null) {
            game.decisionWindowOpen = true;
            game.selectedLane = game.carLane;
        }

        if (game.decisionWindowOpen && game.decision === null) {
            game.speed = BASE_SPEED * 0.3;
        } else if (game.decision !== null) {
            game.speed = BASE_SPEED;
        }

        game.timeSlowFactor = 1;
    } else if (game.crosswalk4Y < 0) {
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
    } else if (game.crosswalk4Y >= canvas.height) {
        // 4. Yaya geçidi geçildi - otomatik karar kaydet
        const alreadyDecided = game.crosswalkDecisions.some(d => d.number === 4);
        if (!alreadyDecided) {
            const autoDecision = game.carLane === 0 ? 'left' : 'right';
            game.crosswalkDecisions.push({
                number: 4,
                lane: game.carLane,
                decision: autoDecision
            });
        }
        game.crosswalk4Triggered = false;
        game.decision = null;
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
        game.decisionWindowOpen = false;
        game.selectedLane = null;
        game.crosswalkNumber++;
    }
}

function drawFourthDecisionWindow() {
    drawGenericDecisionWindow(
        'Sol Taraf',
        'Yaşlı Yayalar',
        ['👴 👴 2 yaşlı erkek', '👵 1 yaşlı kadın'],
        '#6366f1',
        'Sağ Taraf',
        'Genç Yayalar',
        ['👧 1 kız çocuk', '👦 1 erkek çocuk', '👨 1 adam'],
        '#ec4899'
    );
}

// 5. YAA GEÇİDİ FONKSIYONLARI
function drawFifthCrosswalk() {
    if (game.crosswalkNumber > 5) return;
    if (game.crosswalk5Y > canvas.height + 100) return;
    
    const roadX = Math.round(canvas.width / 2 - ROAD_WIDTH / 2);
    
    if (game.crosswalk5Y < canvas.height && game.crosswalk5Y > -50) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        const stripeWidth = 15;
        for (let i = 0; i < ROAD_WIDTH; i += stripeWidth * 2) {
            ctx.fillRect(Math.round(roadX + i), Math.round(game.crosswalk5Y), stripeWidth, 40);
        }
    }
    
    if (game.crosswalk5Y < canvas.height && game.crosswalk5Y > -100) {
        ctx.imageSmoothingEnabled = false;
        const centerX = canvas.width / 2;
        const yPos = game.crosswalk5Y + 20;
        
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(centerX - 85, yPos - 8, 25, 15);
        
        drawAdultMan(centerX + 20, yPos);
        drawLargeWoman(centerX + 50, yPos);
        drawLargeWoman(centerX + 75, yPos);
    }
}

function updateFifthCrosswalk() {
    if (game.crosswalkNumber !== 5) return;
    
    if (game.crosswalk5Y >= 0 && game.crosswalk5Y < canvas.height && !game.crosswalk5Triggered) {
        game.crosswalk5Triggered = true;
    }
    
    if (game.crosswalk5Y >= 0 && game.crosswalk5Y < canvas.height) {
        if (!game.decisionWindowOpen && game.decision === null) {
            game.decisionWindowOpen = true;
            game.selectedLane = game.carLane;
        }

        if (game.decisionWindowOpen && game.decision === null) {
            game.speed = BASE_SPEED * 0.3;
        } else if (game.decision !== null) {
            game.speed = BASE_SPEED;
        }

        game.timeSlowFactor = 1;
    } else if (game.crosswalk5Y < 0) {
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
    } else if (game.crosswalk5Y >= canvas.height) {
        // 5. Yaya geçidi geçildi - otomatik karar kaydet
        const alreadyDecided = game.crosswalkDecisions.some(d => d.number === 5);
        if (!alreadyDecided) {
            const autoDecision = game.carLane === 0 ? 'left' : 'right';
            game.crosswalkDecisions.push({
                number: 5,
                lane: game.carLane,
                decision: autoDecision
            });
        }
        game.crosswalk5Triggered = false;
        game.decision = null;
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
        game.decisionWindowOpen = false;
        game.selectedLane = null;
        game.crosswalkNumber++;
    }
}

function drawFifthDecisionWindow() {
    drawGenericDecisionWindow(
        'Sol Taraf',
        'Fit Olanlar (Araçta)',
        ['🏃‍♂️ 🏃‍♂️ 2 erkek sporcu', '🏃‍♀️ 🏃‍♀️ 2 kadın sporcu'],
        '#8b5cf6',
        'Sağ Taraf',
        'Fit Olmayanlar (Yayalar)',
        ['👨 1 erkek', '👩 👩 2 iri kadın', '👨 1 iri erkek'],
        '#f59e0b'
    );
}

// 6. YAA GEÇİDİ FONKSIYONLARI
function drawSixthCrosswalk() {
    if (game.crosswalkNumber > 6) return;
    if (game.crosswalk6Y > canvas.height + 100) return;
    
    const roadX = Math.round(canvas.width / 2 - ROAD_WIDTH / 2);
    
    if (game.crosswalk6Y < canvas.height && game.crosswalk6Y > -50) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        const stripeWidth = 15;
        for (let i = 0; i < ROAD_WIDTH; i += stripeWidth * 2) {
            ctx.fillRect(Math.round(roadX + i), Math.round(game.crosswalk6Y), stripeWidth, 40);
        }
    }
    
    if (game.crosswalk6Y < canvas.height && game.crosswalk6Y > -100) {
        ctx.imageSmoothingEnabled = false;
        const centerX = canvas.width / 2;
        const yPos = game.crosswalk6Y + 20;
        
        drawOldWoman(centerX - 75, yPos);
        drawCriminal(centerX - 50, yPos);
        drawCriminal(centerX - 25, yPos);
        drawChild(centerX + 5, yPos);
        drawOldWoman(centerX + 30, yPos);
        drawOldWoman(centerX + 65, yPos);
        drawCriminal(centerX + 85, yPos);
    }
}

function drawCriminal(x, y) {
    ctx.fillStyle = '#1f2937';

    ctx.beginPath();
    ctx.arc(x, y - 14, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 5, y - 3, 10, 12);

    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 4, y + 9, 2, 6);
    ctx.fillRect(x + 2, y + 9, 2, 6);
}

function updateSixthCrosswalk() {
    if (game.crosswalkNumber !== 6) return;
    
    if (game.crosswalk6Y >= 0 && game.crosswalk6Y < canvas.height && !game.crosswalk6Triggered) {
        game.crosswalk6Triggered = true;
    }
    
    if (game.crosswalk6Y >= 0 && game.crosswalk6Y < canvas.height) {
        if (!game.decisionWindowOpen && game.decision === null) {
            game.decisionWindowOpen = true;
            game.selectedLane = game.carLane;
        }

        if (game.decisionWindowOpen && game.decision === null) {
            game.speed = 0;
            game.speed = BASE_SPEED * 0.3;
        } else if (game.decision !== null) {
            game.speed = BASE_SPEED;
        }

        game.timeSlowFactor = 1;
    } else if (game.crosswalk6Y < 0) {
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
    } else if (game.crosswalk6Y >= canvas.height) {
        // 6. Yaya geçidi geçildi - otomatik karar kaydet
        const alreadyDecided = game.crosswalkDecisions.some(d => d.number === 6);
        if (!alreadyDecided) {
            const autoDecision = game.carLane === 0 ? 'left' : 'right';
            game.crosswalkDecisions.push({
                number: 6,
                lane: game.carLane,
                decision: autoDecision
            });
        }
        game.crosswalk6Triggered = false;
        game.decision = null;
        game.speed = BASE_SPEED;
        game.timeSlowFactor = 1;
        game.decisionWindowOpen = false;
        game.selectedLane = null;
        game.crosswalkNumber++;
    }
}

function drawSixthDecisionWindow() {
    drawGenericDecisionWindow(
        'Sol Taraf',
        'Çoğunluk (5 Kişi)',
        ['👵 👵 2 yaşlı kadın', '🔴 🔴 2 suçlu', '👦 1 erkek çocuk'],
        '#a78bfa',
        'Sağ Taraf',
        'Azınlık (2 Kişi)',
        ['👵 1 yaşlı kadın', '🔴 1 suçlu'],
        '#06b6d4'
    );
}

// Bitiş çizgisini çiz
function drawFinishLine() {
    // Bitiş çizgisini hep çiz (kaybolmasın)
    if (game.finishLineY > canvas.height * 2) return;
    
    const roadX = Math.round(canvas.width / 2 - ROAD_WIDTH / 2);
    
    // Bitiş çizgisi (kırmızı-beyaz çizgili)
    if (game.finishLineY < canvas.height && game.finishLineY > -50) {
        ctx.imageSmoothingEnabled = false;
        const stripeWidth = 20;
        
        // Kırmızı ve beyaz şeritler
        ctx.fillStyle = '#FF0000'; // Kırmızı
        for (let i = 0; i < ROAD_WIDTH; i += stripeWidth * 2) {
            ctx.fillRect(Math.round(roadX + i), Math.round(game.finishLineY), stripeWidth, 50);
        }
        
        ctx.fillStyle = '#FFFFFF'; // Beyaz
        for (let i = stripeWidth; i < ROAD_WIDTH; i += stripeWidth * 2) {
            ctx.fillRect(Math.round(roadX + i), Math.round(game.finishLineY), stripeWidth, 50);
        }
        
        // Bitiş yazısı (Türkçe)
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BİTİŞ', canvas.width / 2, game.finishLineY + 25);
    }
    
    // Araç bitiş çizgisine varırsa - SONUÇLAR SAYFASINA GEÇ
    if (!game.gameFinished && game.carY >= game.finishLineY && game.finishLineY > 0) {
        game.gameFinished = true;
        game.speed = 0; // Araç durur
        
        // Fade animasyonu ile sonuç sayfasına geç
        const fadeOverlay = document.createElement('div');
        fadeOverlay.style.position = 'fixed';
        fadeOverlay.style.top = '0';
        fadeOverlay.style.left = '0';
        fadeOverlay.style.width = '100%';
        fadeOverlay.style.height = '100%';
        fadeOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0)';
        fadeOverlay.style.zIndex = '9999';
        fadeOverlay.style.transition = 'background-color 1s ease';
        document.body.appendChild(fadeOverlay);
        
        // Fade animasyonu başlat
        setTimeout(() => {
            fadeOverlay.style.backgroundColor = 'rgba(0, 0, 0, 1)';
        }, 100);
        
        // 1.5 saniye sonra sonuç sayfasını aç
        setTimeout(() => {
            showResults();
            document.body.removeChild(fadeOverlay);
        }, 1500);
    }
}

// Sonuç sayfasını göster
function showResults() {
    const decisions = game.crosswalkDecisions;
    
    // Kararları localStorage'e kaydet
    localStorage.setItem('gameDecisions', JSON.stringify(decisions));
    
    // Sonuç sayfasına yönlendir
    window.location.href = 'results.html';
    return;
    
    // İstatistik verileri (artık kullanılmaz ama refactoring için burada bırakıyoruz)
    const statsData = [
        {
            num: 1,
            title: 'Kurallara Uyan vs Uymayan',
            left: 'Kurallara Uyan zarar görür',
            leftPercent: 16,
            right: 'Kurallara Uymayan zarar görür',
            rightPercent: 84
        },
        {
            num: 2,
            title: 'Hayvanlar vs İnsanlar',
            left: 'Hayvanlar zarar görür',
            leftPercent: 92.9,
            right: 'İnsanlar zarar görür',
            rightPercent: 7.1
        },
        {
            num: 3,
            title: 'Araçtaki Kız vs Yoldaki Erkek',
            left: 'Araçtaki kız zarar görür',
            leftPercent: 23,
            right: 'Yoldaki erkek zarar görür',
            rightPercent: 77
        },
        {
            num: 4,
            title: 'Yaşlılar vs Gençler',
            left: 'Yaşlılar zarar görür',
            leftPercent: 99,
            right: 'Gençler zarar görür',
            rightPercent: 1
        },
        {
            num: 5,
            title: 'Araçtaki Sporcular vs Yoldaki Bireyler',
            left: 'Araçtaki sporcular zarar görür',
            leftPercent: 6,
            right: 'Yoldaki iri bireyler zarar görür',
            rightPercent: 94
        },
        {
            num: 6,
            title: 'Araçtaki 5 Kişi vs 2 Yaya',
            left: 'Araçtaki 5 kişi zarar görür',
            leftPercent: 4,
            right: '2 Yaya zarar görür',
            rightPercent: 96
        }
    ];
    
    let scenariosHTML = '';
    statsData.forEach((stat, idx) => {
        const decision = decisions[idx];
        const playerChoice = decision ? (decision.decision === 'left' ? 'left' : 'right') : null;
        
        const leftBarColor = playerChoice === 'left' ? '#4CAF50' : '#90EE90';
        const rightBarColor = playerChoice === 'right' ? '#f44336' : '#ffcdd2';
        
        scenariosHTML += `
            <div class="scenario-card">
                <div class="scenario-header">
                    <h3>Senaryo ${stat.num}</h3>
                    <span class="scenario-title">${stat.title}</span>
                </div>
                
                <div class="scenario-content">
                    <div class="choice-row">
                        <div class="choice ${playerChoice === 'left' ? 'selected' : ''}">
                            <div class="choice-label">
                                <span class="emoji">⬅️</span>
                                <span>${stat.left}</span>
                            </div>
                            <div class="stats-bar">
                                <div class="bar-bg">
                                    <div class="bar-fill" style="width: ${stat.leftPercent}%; background-color: ${leftBarColor};"></div>
                                </div>
                                <span class="percentage">${stat.leftPercent}%</span>
                            </div>
                            ${playerChoice === 'left' ? '<div class="user-choice">SİZİN SEÇİMİNİZ</div>' : ''}
                        </div>
                    </div>
                    
                    <div class="choice-row">
                        <div class="choice ${playerChoice === 'right' ? 'selected' : ''}">
                            <div class="choice-label">
                                <span class="emoji">➡️</span>
                                <span>${stat.right}</span>
                            </div>
                            <div class="stats-bar">
                                <div class="bar-bg">
                                    <div class="bar-fill" style="width: ${stat.rightPercent}%; background-color: ${rightBarColor};"></div>
                                </div>
                                <span class="percentage">${stat.rightPercent}%</span>
                            </div>
                            ${playerChoice === 'right' ? '<div class="user-choice">SİZİN SEÇİMİNİZ</div>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    const resultsHTML = `
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
            <title>Oyun Sonuçları</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 40px;
                }
                
                .header h1 {
                    font-size: 3em;
                    color: #333;
                    margin-bottom: 10px;
                }
                
                .header p {
                    color: #666;
                    font-size: 1.1em;
                }
                
                .scenarios-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
                    gap: 20px;
                    margin-bottom: 40px;
                }
                
                .scenario-card {
                    background: #f8f9fa;
                    border-radius: 12px;
                    padding: 20px;
                    border-left: 4px solid #667eea;
                }
                
                .scenario-header {
                    margin-bottom: 15px;
                }
                
                .scenario-header h3 {
                    color: #667eea;
                    font-size: 1.2em;
                    margin-bottom: 5px;
                }
                
                .scenario-title {
                    color: #666;
                    font-size: 0.95em;
                    font-weight: 500;
                }
                
                .scenario-content {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                
                .choice-row {
                    display: flex;
                    gap: 10px;
                }
                
                .choice {
                    flex: 1;
                    padding: 12px;
                    border-radius: 8px;
                    background: white;
                    border: 2px solid #e0e0e0;
                    transition: all 0.3s ease;
                }
                
                .choice.selected {
                    border-color: #667eea;
                    background: #f0f4ff;
                }
                
                .choice-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                    font-weight: 500;
                    color: #333;
                    font-size: 0.95em;
                }
                
                .emoji {
                    font-size: 1.2em;
                }
                
                .stats-bar {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .bar-bg {
                    flex: 1;
                    height: 24px;
                    background: #e0e0e0;
                    border-radius: 12px;
                    overflow: hidden;
                }
                
                .bar-fill {
                    height: 100%;
                    border-radius: 12px;
                    transition: all 0.3s ease;
                }
                
                .percentage {
                    font-weight: bold;
                    min-width: 50px;
                    text-align: right;
                    color: #333;
                    font-size: 0.9em;
                }
                
                .user-choice {
                    display: inline-block;
                    background: #667eea;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.8em;
                    font-weight: bold;
                    margin-top: 8px;
                }
                
                .footer {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    margin-top: 30px;
                }
                
                button {
                    padding: 14px 40px;
                    font-size: 16px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-weight: bold;
                }
                
                .btn-play-again {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                
                .btn-play-again:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
                }
                
                .btn-home {
                    background: white;
                    color: #667eea;
                    border: 2px solid #667eea;
                }
                
                .btn-home:hover {
                    background: #f5f5f5;
                }
                
                @media (max-width: 768px) {
                    .container {
                        padding: 20px;
                    }
                    
                    .header h1 {
                        font-size: 2em;
                    }
                    
                    .scenarios-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .footer {
                        flex-direction: column;
                    }
                    
                    button {
                        width: 100%;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏁 OYUN TAMAMLANDI!</h1>
                    <p>Tüm senaryolardaki seçimleriniz ve genel istatistikler</p>
                </div>
                
                <div class="scenarios-grid">
                    ${scenariosHTML}
                </div>
                
                <div class="footer">
                    <button class="btn-play-again" onclick="location.reload()">🔄 Tekrar Oyna</button>
                    <button class="btn-home" onclick="goHome()">🏠 Ana Sayfa</button>
                </div>
            </div>
            
            <script>
                function goHome() {
                    window.location.href = 'index.html';
                }
            </script>
        </body>
        </html>
    `;
    
    // Sonuçları yeni sayfada aç
    const blob = new Blob([resultsHTML], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, 'results', 'width=1400,height=900');
}

// Oyunu başlat - DOM tamamen yüklendikten sonra
window.addEventListener('load', function() {
    console.log('Oyun başlıyor...');
    console.log('Canvas:', canvas.width, 'x', canvas.height);
    
    // Mobil cihazda tam ekran iste
    requestFullscreen();
    
    // Ekran yönüne kilitlenme (landscape)
    lockScreenOrientation();
    
    // Delta time için ilk zaman damgasını sıfırla
    lastFrameTime = 0;
    
    // Oyun döngüsünü başlat (requestAnimationFrame timestamp verir)
    requestAnimationFrame(gameLoop);
});

// Tam ekran iste
function requestFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {
            // Tam ekran hatası - sessizce yoksay
        });
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen().catch(() => {});
    } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen().catch(() => {});
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen().catch(() => {});
    }
}

// Ekran yönüne kilitlenme
function lockScreenOrientation() {
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {
            // Yönlendirme kilit hatası - sessizce yoksay
        });
    } else if (screen.lockOrientation) {
        screen.lockOrientation('landscape');
    } else if (screen.mozLockOrientation) {
        screen.mozLockOrientation('landscape');
    } else if (screen.msLockOrientation) {
        screen.msLockOrientation('landscape');
    } else if (screen.webkitLockOrientation) {
        screen.webkitLockOrientation('landscape');
    }
}
