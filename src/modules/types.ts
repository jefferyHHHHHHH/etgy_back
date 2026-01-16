import type { Router } from 'express';

export type AppModule = {
	name: string;
	basePath: string;
	router: Router;
};
