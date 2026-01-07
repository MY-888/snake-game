const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const WORLD_SIZE = 3000;
const INITIAL_LENGTH = 15;

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let foods = [];

// 初始化食物
for (let i = 0; i < 200; i++) {
    foods.push(generateFood());
}

function generateFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        size: Math.random() * 5 + 3
    };
}

io.on('connection', (socket) => {
    console.log('新玩家連接:', socket.id);

    // 創建新玩家
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        angle: Math.random() * Math.PI * 2,
        segments: [],
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        radius: 12,
        score: 0
    };

    // 初始化段落
    for (let i = 0; i < INITIAL_LENGTH; i++) {
        players[socket.id].segments.push({ x: players[socket.id].x, y: players[socket.id].y });
    }

    // 發送初始數據
    socket.emit('init', { id: socket.id, worldSize: WORLD_SIZE, foods });

    // 監聽玩家移動
    socket.on('updateAngle', (angle) => {
        if (players[socket.id]) {
            players[socket.id].angle = angle;
        }
    });

    socket.on('disconnect', () => {
        console.log('玩家斷開:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// 遊戲主循環 (伺服器端邏輯)
setInterval(() => {
    Object.values(players).forEach(player => {
        // 更新位置
        const speed = 4;
        player.x += Math.cos(player.angle) * speed;
        player.y += Math.sin(player.angle) * speed;

        // 邊界限制
        if (player.x < 0) player.x = 0;
        if (player.x > WORLD_SIZE) player.x = WORLD_SIZE;
        if (player.y < 0) player.y = 0;
        if (player.y > WORLD_SIZE) player.y = WORLD_SIZE;

        // 更新段落
        player.segments.unshift({ x: player.x, y: player.y });
        player.segments.pop();

        // 粗細隨長度變化
        player.radius = Math.min(12 + (player.segments.length / 50), 30);

        // 吃食物檢測
        foods.forEach((food, index) => {
            const dx = player.x - food.x;
            const dy = player.y - food.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < player.radius + food.size) {
                foods.splice(index, 1);
                // 增長
                for(let i=0; i<3; i++) player.segments.push({...player.segments[player.segments.length-1]});
                foods.push(generateFood());
                io.emit('foodEaten', { foodId: food.id, newFood: foods[foods.length-1] });
            }
        });

        // 碰撞檢測 (簡單版：撞到別人身體會死)
        Object.values(players).forEach(other => {
            if (player.id === other.id) return;
            other.segments.forEach((seg, idx) => {
                if (idx < 5) return; // 忽略頭部附近的碰撞
                const dx = player.x - seg.x;
                const dy = player.y - seg.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < player.radius + other.radius - 5) {
                    // 玩家死亡，重置
                    player.x = Math.random() * WORLD_SIZE;
                    player.y = Math.random() * WORLD_SIZE;
                    player.segments = [];
                    for (let i = 0; i < INITIAL_LENGTH; i++) {
                        player.segments.push({ x: player.x, y: player.y });
                    }
                }
            });
        });
    });

    io.emit('gameState', { players });
}, 1000 / 30); // 30 FPS 更新

server.listen(PORT, () => {
    console.log(`伺服器運行在 http://localhost:${PORT}`);
});
