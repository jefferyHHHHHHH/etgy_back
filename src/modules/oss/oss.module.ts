import ossRoutes from '../../routes/oss.routes';
import type { AppModule } from '../types';

export const ossModule: AppModule = {
  name: 'oss',
  basePath: '/api/oss',
  router: ossRoutes,
};

export default ossModule;
