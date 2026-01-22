import aiRoutes from '../../routes/ai.routes';
import type { AppModule } from '../types';

export const aiModule: AppModule = {
  name: 'ai',
  basePath: '/api/ai',
  router: aiRoutes,
};

export default aiModule;
