<script setup lang="ts">
import type { TabsContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { TabsContent } from 'reka-ui'

const props = defineProps<TabsContentProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <TabsContent
    data-slot="tabs-content"
    :class="cn('text-sm flex-1 rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </TabsContent>
</template>
