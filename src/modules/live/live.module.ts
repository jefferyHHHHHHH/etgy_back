import liveRoutes from '../../routes/live.routes';
import type { AppModule } from '../types';

export const liveModule: AppModule = {
  name: 'live',
  basePath: '/api/live',
  router: liveRoutes,
};

export default liveModule;
