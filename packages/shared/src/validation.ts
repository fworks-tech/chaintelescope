/**
 * @fileoverview Contratos Joi compartilhados entre API e cliente. O tipo TS é
 * ligado ao schema por `Joi.object<T, true>`: chave faltando, sobrando ou com
 * tipo incompatível quebra o typecheck, então schema e tipo não divergem.
 * @module shared/validation
 */

import Joi from "joi";

export interface RegisterPayload {
  email: string;
  password: string;
}

export const RegisterPayloadSchema = Joi.object<RegisterPayload, true>({
  email: Joi.string().trim().lowercase().email().max(320).required(),
  // O piso de 12 caracteres fica na política de senha, não no contrato de forma.
  password: Joi.string().max(128).required(),
}).meta({ className: "RegisterPayload" });

export type LoginPayload = RegisterPayload;

export const LoginPayloadSchema = Joi.object<LoginPayload, true>({
  email: Joi.string().trim().lowercase().email().max(320).required(),
  password: Joi.string().max(128).required(),
}).meta({ className: "LoginPayload" });

export type ScanKind = "upload" | "feed" | "snapshot";

export interface CreateScanPayload {
  kind: ScanKind;
  assetSymbol?: string;
}

export const CreateScanPayloadSchema = Joi.object<CreateScanPayload, true>({
  kind: Joi.string().valid("upload", "feed", "snapshot").required(),
  assetSymbol: Joi.string().min(1).max(12).uppercase().when("kind", {
    is: "snapshot",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
}).meta({ className: "CreateScanPayload" });
