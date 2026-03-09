import * as db from '../../db/index.js';

export type { TemplateRow } from '../../db/index.js';

export const templatesRepository = {
  getById: (id: string) => db.getTemplate(id),

  listPublic: () => db.listTemplates(),

  listByUser: (userId: string) => db.listTemplatesByUserId(userId),

  put: (row: db.TemplateRow) => db.putTemplate(row),

  delete: (id: string, userId: string) => db.deleteTemplate(id, userId),

  getUserById: (id: string) => db.getUserById(id),
};
