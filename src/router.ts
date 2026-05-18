// Generouted, changes to this file will be overridden
/* eslint-disable */

import { components, hooks, utils } from '@generouted/react-router/client'

export type Path =
  | `*`
  | `/`
  | `/activities`
  | `/companies`
  | `/companies/:id`
  | `/contacts`
  | `/contacts/:id`
  | `/deals`
  | `/deals/:id`
  | `/email`
  | `/privacy`
  | `/terms`

export type Params = {
  '/*': { '*': string }
  '/companies/:id': { id: string }
  '/contacts/:id': { id: string }
  '/deals/:id': { id: string }
}

export type ModalPath = never

export const { Link, Navigate } = components<Path, Params>()
export const { useModals, useNavigate, useParams } = hooks<Path, Params, ModalPath>()
export const { redirect } = utils<Path, Params>()
