export interface Field {
  name: string;
  type: string;
  required: boolean;
}

export interface EntityModel {
  name: string;
  fields: Field[];
}

export interface Contract {
  service: string;
  entities: EntityModel[];
}

export const entityByName = (contract: Contract, name: string): EntityModel | undefined =>
  contract.entities.find((entity) => entity.name === name);

export const addField = (entity: EntityModel, field: Field): EntityModel => {
  const fields = entity.fields.some((item) => item.name === field.name)
    ? entity.fields.map((item) => (item.name === field.name ? field : item))
    : [...entity.fields, field];
  return { ...entity, fields };
};

export const validateEntity = (entity: EntityModel): string[] => {
  const out: string[] = [];
  if (!entity.name) out.push('missing_name');
  if (entity.fields.length === 0) out.push('no_fields');
  const names = entity.fields.map((item) => item.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) out.push('duplicate_fields');
  return out;
};
