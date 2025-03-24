import { Layer, ManagedRuntime } from 'effect';

import * as Database from './lib/database/db.js';
import { PetFoodRepository } from './lib/repositories/pet-food.js';

const appLayer = Layer.merge(Database.layer, PetFoodRepository.Default);

export const runtime = ManagedRuntime.make(appLayer);
