import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

import barSchema from './schemas/bar.schema.json';
import barOfferItemSchema from './schemas/bar_offer_item.schema.json';
import barMemberMappingSchema from './schemas/bar_member_mapping.schema.json';

const ajv = new Ajv({ allErrors: true, removeAdditional: false });
addFormats(ajv);

const validators = {
    bar: ajv.compile(barSchema),
    barOfferItem: ajv.compile(barOfferItemSchema),
    barMemberMapping: ajv.compile(barMemberMappingSchema),
} as const;

export type SchemaType = keyof typeof validators;

export type ValidationResult<T = unknown> =
    { valid: true; data: T; errors?: never }
    | { valid: false; errors: ValidationError[]; data?: never };

export interface ValidationError {
    field: string;
    message: string;
}

export function validate<T = unknown>(
    schemaType: SchemaType,
    data: unknown
): ValidationResult<T> {
    const validator = validators[schemaType];
    const valid = validator(data);

    if (valid) {
        return {
            valid: true,
            data: data as T
        };
    }

    return {
        valid: false,
        errors: formatErrors(validator.errors || [])
    };
}

/**
 * Format AJV errors into a more user-friendly format
 */
function formatErrors(errors: ErrorObject[]): ValidationError[] {
    return errors.map((error) => {
        const field = error.instancePath.slice(1) || error.params.missingProperty || 'root';
        let message = error.message || 'Invalid value';

        return {
            field,
            message
        };
    });
}

/**
 * Helper to get validation errors as a Record for form field mapping
 */
export function getFieldErrors(errors: ValidationError[]): Record<string, string> {
    return errors.reduce(
        (acc, error) => {
            acc[error.field] = error.message;
            return acc;
        },
        {} as Record<string, string>
    );
}
