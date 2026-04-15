import { createContext, useContext, useMemo, useEffect, useRef } from 'react'
import { useUser } from '@spaces/sdk/storage'
import { useCompanies } from './useCompanies'
import { useDeals } from './useDeals'
import { usePipelineStages } from './usePipelineStages'
import { useActivities } from './useActivities'
import { usePeople } from './usePeople'
import { useDealContacts } from './useDealContacts'
import { useEmail } from './useEmail'
import { PIPELINE_STAGES_BOOTSTRAP } from '../constants'
import type {
  Company, Deal, PipelineStage, Activity, Person, DealContact,
  DealContactRole, ConnectionStatus,
} from './types'

interface SendEmailParams {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  text?: string
}

interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
  rateLimited?: boolean
}

interface CrmContextValue {
  companies: Company[]
  companiesStatus: ConnectionStatus
  addCompany: (data: Partial<Omit<Company, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => Promise<void>
  updateCompany: (id: string, changes: Record<string, unknown>) => Promise<void>
  removeCompany: (id: string) => Promise<void>

  deals: Deal[]
  dealsStatus: ConnectionStatus
  addDeal: (data: Partial<Omit<Deal, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => Promise<void>
  updateDeal: (id: string, changes: Record<string, unknown>) => Promise<void>
  removeDeal: (id: string) => Promise<void>

  stages: PipelineStage[]
  stagesStatus: ConnectionStatus

  activities: Activity[]
  activitiesStatus: ConnectionStatus
  addActivity: (data: Partial<Omit<Activity, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => Promise<void>
  updateActivity: (id: string, changes: Record<string, unknown>) => Promise<void>
  removeActivity: (id: string) => Promise<void>

  people: Person[]
  peopleStatus: ConnectionStatus
  addPerson: (data: Partial<Omit<Person, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => Promise<void>
  updatePerson: (id: string, changes: Record<string, unknown>) => Promise<void>
  removePerson: (id: string) => Promise<void>

  dealContacts: DealContact[]
  contactsByDeal: Record<string, DealContact[]>
  linkContact: (dealId: string, contactId: string, role?: DealContactRole) => Promise<void>
  unlinkContact: (id: string) => Promise<void>

  openDeals: Deal[]
  totalPipelineValue: number
  recentActivities: Activity[]

  userId: string | undefined

  // Email
  emailAddress: string | null
  hasEmail: boolean
  isEmailLoading: boolean
  isSendingEmail: boolean
  sendEmail: (params: SendEmailParams) => Promise<SendEmailResult>
  refreshEmailStatus: () => void
}

const CrmContext = createContext<CrmContextValue>(null!)

export function useCrm() {
  return useContext(CrmContext)
}

export function CrmPlatformProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser()

  const {
    companies, status: companiesStatus,
    addCompany, updateCompany, removeCompany,
  } = useCompanies()

  const {
    deals, status: dealsStatus,
    addDeal, updateDeal, removeDeal,
  } = useDeals()

  const {
    stages, status: stagesStatus, bootstrapStages,
  } = usePipelineStages()

  const {
    activities, status: activitiesStatus,
    addActivity, updateActivity, removeActivity,
  } = useActivities()

  const {
    people, status: peopleStatus,
    addPerson, updatePerson, removePerson,
  } = usePeople()

  const {
    dealContacts, contactsByDeal,
    status: dealContactsStatus,
    linkContact, unlinkContact,
  } = useDealContacts()

  const {
    emailAddress, hasEmail, isLoading: isEmailLoading,
    isSending: isSendingEmail, sendEmail, refreshEmailStatus,
  } = useEmail()

  // Bootstrap pipeline stages on first connect
  const bootstrapRef = useRef(false)
  useEffect(() => {
    if (
      stagesStatus === 'connected' &&
      stages.length === 0 &&
      !bootstrapRef.current
    ) {
      bootstrapRef.current = true
      bootstrapStages(PIPELINE_STAGES_BOOTSTRAP)
    }
  }, [stagesStatus, stages.length, bootstrapStages])

  const openDeals = useMemo(
    () => deals.filter(d => d.status === 'open'),
    [deals],
  )

  const totalPipelineValue = useMemo(
    () => openDeals.reduce((sum, d) => sum + d.amount * (d.probability / 100), 0),
    [openDeals],
  )

  const recentActivities = useMemo(
    () => activities.slice(0, 20),
    [activities],
  )

  // Use individual stable references as dependencies instead of whole state objects.
  // Each hook's arrays are memoized and callbacks are wrapped in useCallback,
  // so these references are stable unless actual data changes.
  const value = useMemo<CrmContextValue>(() => ({
    companies,
    companiesStatus,
    addCompany,
    updateCompany,
    removeCompany,

    deals,
    dealsStatus,
    addDeal,
    updateDeal,
    removeDeal,

    stages,
    stagesStatus,

    activities,
    activitiesStatus,
    addActivity,
    updateActivity,
    removeActivity,

    people,
    peopleStatus,
    addPerson,
    updatePerson,
    removePerson,

    dealContacts,
    contactsByDeal,
    linkContact,
    unlinkContact,

    openDeals,
    totalPipelineValue,
    recentActivities,

    userId: user?.id,

    emailAddress,
    hasEmail,
    isEmailLoading,
    isSendingEmail,
    sendEmail,
    refreshEmailStatus,
  }), [
    companies, companiesStatus, addCompany, updateCompany, removeCompany,
    deals, dealsStatus, addDeal, updateDeal, removeDeal,
    stages, stagesStatus,
    activities, activitiesStatus, addActivity, updateActivity, removeActivity,
    people, peopleStatus, addPerson, updatePerson, removePerson,
    dealContacts, contactsByDeal, linkContact, unlinkContact,
    openDeals, totalPipelineValue, recentActivities, user?.id,
    emailAddress, hasEmail, isEmailLoading, isSendingEmail, sendEmail, refreshEmailStatus,
  ])

  return (
    <CrmContext.Provider value={value}>
      {children}
    </CrmContext.Provider>
  )
}
