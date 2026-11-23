import { createRouter, createWebHistory } from 'vue-router'
import Patients from '@/components/Patients.vue'
import NewPatient from '@/components/NewPatient.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Patients',
      component: Patients
    },
    {
      path: '/patients/new',
      name: 'NewPatient',
      component: NewPatient
    }
  ]
})

export default router
