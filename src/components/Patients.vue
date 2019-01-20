/* eslint-disable */

<template>
  <div class="patients">
    <h1>Patients</h1>
 <div v-if="patients.length > 0" class="table-wrap">
      <div>
        <router-link v-bind:to="{ name: 'NewPatient' }" class="">Add Patient</router-link>
      </div>
      <table>
        <tr>
          <td>Name</td>
          <td>Prénom</td>
          <td>Sexe</td>
          <td>IPP</td>
          <td>Date de naissance</td>
          <td>Date d'admission</td>
          <td>Service</td>
          <td>Chambre</td>
          <td>Lit</td>
          <td>Date de sortie</td>
   
        </tr>

      <template v-for="patient in patients" >
        <tr :class="patient.action" v-on:click="expand(patient.ipp)">
          <td>{{ patient.name }}</td>
          <td>{{ patient.firstname }}</td>
          <td>{{ patient.sex }}</td>
          <td>{{ patient.ipp }}</td>
          <td>{{ patient.birthDate }}</td>
          <td>{{ patient.surgeryDate }}</td>
          <td>{{ patient.service }}</td>
          <td>{{ patient.room }}</td>
          <td>{{ patient.bed }}</td>
          <td>{{ patient.checkoutDate }}</td>
         </tr>
         <tr v-for="item in patient.history" v-if="patient.ipp in expanded">
          <td>{{ item.event }}</td>
          <td>{{ item.date }}</td>
          <td v-if="item.service" >{{ item.service }}</td>
          <td v-if="item.room">{{ item.room }}</td>
          <td v-if="item.bed">{{ item.bed }}</td>
         </tr>
      </template>

      </table>
    </div>
    <div v-else>
      There are no patients.. Lets add one now <br /><br />
      <router-link v-bind:to="{ name: 'NewPatient' }" class="add_patient_link">Add Patient</router-link>
    </div>
  </div>
</template>

<script>
import PostsService from '@/services/PostsService'

export default {
  name: 'patients',
  data () {
    return {
      patients: [],
      expanded: {}
    }
  },
  mounted () {
    this.getPatients()
    this.$socket.on('refresh', (data) => {
      this.getPatients()
    });
  },
  methods: {
    async getPatients () {
      const response = await PostsService.fetchPosts()
      this.patients = response.data.patients
    },
    expand(id) {
      if (id in this.expanded)
        this.$delete(this.expanded, id);
      else
        this.$set(this.expanded, id, true);
    }
  }
}
</script>

<style type="text/css">
.table-wrap {
  width: 90%;
  margin: 0 auto;
  text-align: center;
}
table {
  width: 100%;
}
table th, table tr {
  text-align: left;
}
table thead {
  background: #f2f2f2;
}
table tr td {
  padding: 10px;
}
/* table tr:nth-child(odd) {
  background: #f2f2f2;
} */
table tr:nth-child(1) {
  background: #4d7ef7;
  color: #fff;
} 
.insert {
  background: #c8f1b8;
}
.transfert {
  background: #f7d39e;
}
.checkout {
  background: #cfcdcd;
}
a {
  color: #4d7ef7;
  text-decoration: none;
}
a.add_patient_link {
  background: #4d7ef7;
  color: #fff;
  padding: 10px 80px;
  text-transform: uppercase;
  font-size: 12px;
  font-weight: bold;
}
</style>
