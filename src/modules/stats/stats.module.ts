import statsRoutes from '../../routes/stats.routes';
import type { AppModule } from '../types';

export const statsModule: AppModule = {
  name: 'stats',
  basePath: '/api/stats',
  router: statsRoutes,
};

export default statsModule;
