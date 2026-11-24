import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { SupabaseRepo } from './db/supabase-repo';
import { env } from './env';
import { RoomManager } from './rooms/room-manager';
import { registerWsHandler } from './ws/ws-handler';

const startedAtMs = Date.now();

const app = Fastify({
  logger: { level: env.NODE_ENV === 'production' ? 'info' : 'warn' },
});

const repo = new SupabaseRepo({
  url: env.SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
});
const rooms = new RoomManager({ repo });

await app.register(cors, {
  origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  credentials: false,
});
await app.register(websocket);

app.get('/healthz', async () => ({
  status: 'ok',
  activeRooms: rooms.activeRoomCount,
  uptimeSec: Math.round((Date.now() - startedAtMs) / 1000),
}));

registerWsHandler(app, { repo, rooms });

const idleSweeper = setInterval(() => {
  rooms.sweepIdleRooms();
}, 60_000);
idleSweeper.unref();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`Received ${signal}, shutting down`);
  clearInterval(idleSweeper);
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`NumeraRush server listening on ${env.HOST}:${env.PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
