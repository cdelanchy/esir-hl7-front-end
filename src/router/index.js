import { createRouter, createWebHistory } from 'vue-router'
import Patients from '@/components/Patients.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Patients',
      component: Patients
    }
  ]
})

export default router
