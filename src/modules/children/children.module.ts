import childrenRoutes from '../../routes/children.routes';
import type { AppModule } from '../types';

export const childrenModule: AppModule = {
  name: 'children',
  basePath: '/api/children',
  router: childrenRoutes,
};

export default childrenModule;
