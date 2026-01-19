import platformRoutes from '../../routes/platform.routes';
import type { AppModule } from '../types';

export const platformModule: AppModule = {
  name: 'platform',
  basePath: '/api/platform',
  router: platformRoutes,
};

export default platformModule;
