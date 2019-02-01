import Vue from 'vue'
import Router from 'vue-router'
import Patients from '@/components/Patients'
import NewPatient from '@/components/NewPatient'

Vue.use(Router)

export default new Router({
  mode: 'history',
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
