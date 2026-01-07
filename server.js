const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 10000;
const WORLD_SIZE = 3000;
const INITIAL_LENGTH = 15;
const AI_COUNT = 10;

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let ais = {};
let foods = [];

// 初始化食物
for (let i = 0; i < 300; i++) foods.push(generateFood());

// 初始化 AI
for (let i = 0; i < AI_COUNT; i++) {
    const id = 'ai_' + Math.random().toString(36).substr(2, 5);
    ais[id] = createSnake(id, true);
}

function generateFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        size: Math.random() * 4 + 3
    };
}

function createSnake(id, isAi = false) {
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    let snake = {
        id,
        x,
        y,
        angle: Math.random() * Math.PI * 2,
        segments: [],
        color: isAi ? `hsl(${Math.random() * 360}, 50%, 50%)` : `hsl(${Math.random() * 360}, 80%, 60%)`,
        radius: 12,
        isAi
    };
    for (let i = 0; i < INITIAL_LENGTH; i++) {
        snake.segments.push({ x, y });
    }
    return snake;
}

io.on('connection', (socket) => {
    players[socket.id] = createSnake(socket.id);
    socket.emit('init', { id: socket.id, worldSize: WORLD_SIZE, foods });

    socket.on('updateAngle', (angle) => {
        if (players[socket.id]) players[socket.id].angle = angle;
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

function updateSnake(s, allSnakes) {
    const speed = 4;
    
    if (s.isAi) {
        if (Math.random() < 0.03) s.angle += (Math.random() - 0.5) * 1.5;
        if (s.x < 200 || s.x > WORLD_SIZE - 200 || s.y < 200 || s.y > WORLD_SIZE - 200) s.angle += 0.2;
    }

    s.x += Math.cos(s.angle) * speed;
    s.y += Math.sin(s.angle) * speed;

    // 邊界死亡
    if (s.x < 0 || s.x > WORLD_SIZE || s.y < 0 || s.y > WORLD_SIZE) {
        return true; // 標記死亡
    }

    s.segments.unshift({ x: s.x, y: s.y });
    s.segments.pop();
    s.radius = Math.min(12 + (s.segments.length / 50), 30);

    // 吃食物
    for (let i = foods.length - 1; i >= 0; i--) {
        const f = foods[i];
        const dx = s.x - f.x;
        const dy = s.y - f.y;
        if (dx*dx + dy*dy < (s.radius + f.size)**2) {
            foods.splice(i, 1);
            for(let j=0; j<3; j++) s.segments.push({...s.segments[s.segments.length-1]});
            const newFood = generateFood();
            foods.push(newFood);
            io.emit('foodUpdate', { eatenId: f.id, newFood });
        }
    }

    // 碰撞死亡 (撞到別人)
    for (let other of allSnakes) {
        if (other.id === s.id) continue;
        for (let i = 0; i < other.segments.length; i += 2) {
            const seg = other.segments[i];
            const dx = s.x - seg.x;
            const dy = s.y - seg.y;
            if (dx*dx + dy*dy < (s.radius + other.radius - 5)**2) {
                return true;
            }
        }
    }
    return false;
}

setInterval(() => {
    const allSnakes = [...Object.values(players), ...Object.values(ais)];
    
    // 更新玩家
    Object.keys(players).forEach(id => {
        if (updateSnake(players[id], allSnakes)) {
            players[id] = createSnake(id); // 重生
        }
    });

    // 更新 AI
    Object.keys(ais).forEach(id => {
        if (updateSnake(ais[id], allSnakes)) {
            ais[id] = createSnake(id, true); // 重生
        }
    });

    io.emit('gameState', { players, ais });
}, 1000 / 30);

server.listen(PORT, () => console.log(`Server on ${PORT}`));
