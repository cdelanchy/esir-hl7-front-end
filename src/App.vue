<template>
  <router-view />
  <AppFooter />
</template>

<script>
import AppFooter from '@/components/AppFooter.vue'

export default {
  name: 'App',
  components: { AppFooter }
}
</script>

<style>
html, body, #app {
  margin: 0;
  min-height: 100%;
  min-width: 320px;
  background: #f4f7fb;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
}
</style>
