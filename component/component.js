/*!!!!!!!!!!!Do not change anything between here (the DRIVERNAME placeholder will be automatically replaced at buildtime)!!!!!!!!!!!*/
// https://github.com/rancher/ui/blob/master/lib/shared/addon/mixins/cluster-driver.js
import ClusterDriver from 'shared/mixins/cluster-driver';


// do not remove LAYOUT, it is replaced at build time with a base64 representation of the template of the hbs template
// we do this to avoid converting template to a js file that returns a string and the cors issues that would come along with that
const LAYOUT;
/*!!!!!!!!!!!DO NOT CHANGE END!!!!!!!!!!!*/


/*!!!!!!!!!!!GLOBAL CONST START!!!!!!!!!!!*/
// EMBER API Access - if you need access to any of the Ember API's add them here in the same manner rather then import them via modules, since the dependencies exist in rancher we dont want to expor the modules in the amd def
const computed     = Ember.computed;
const observer     = Ember.observer;
const get          = Ember.get;
const set          = Ember.set;
const alias        = Ember.computed.alias;
const service      = Ember.inject.service;
const all          = Ember.RSVP.all;

/*!!!!!!!!!!!GLOBAL CONST END!!!!!!!!!!!*/

const on            = Ember.on;
const equal         = Ember.computed.equal;
const setProperties = Ember.setProperties;
const hash          = Ember.RSVP.hash;

import ipaddr from 'ipaddr.js';

import {
  sizes,
  aksRegions,
} from 'ui/utils/azure-choices';

// const NETWORK_POLICY = ['Calico']

/*!!!!!!!!!!!DO NOT CHANGE START!!!!!!!!!!!*/
export default Ember.Component.extend(ClusterDriver, {
  driverName:  '%%DRIVERNAME%%',
  configField: '%%DRIVERNAME%%EngineConfig', // 'googleKubernetesEngineConfig'
  app:         service(),
  router:      service(),
  /*!!!!!!!!!!!DO NOT CHANGE END!!!!!!!!!!!*/

  intl:        service(),
  
  init() {
    /*!!!!!!!!!!!DO NOT CHANGE START!!!!!!!!!!!*/
    // This does on the fly template compiling, if you mess with this :cry:
    const decodedLayout = window.atob(LAYOUT);
    const template      = Ember.HTMLBars.compile(decodedLayout, {
      moduleName: 'shared/components/cluster-driver/driver-%%DRIVERNAME%%/template'
    });
    set(this,'layout', template);

    this._super(...arguments);
    /*!!!!!!!!!!!DO NOT CHANGE END!!!!!!!!!!!*/

    let config      = get(this, 'config');
    let configField = get(this, 'configField');


    if ( !config ) {
      config = this.get('globalStore').createRecord({
        type:                         configField,
        agentPoolName:                'rancher',
        agentOsdiskSize:              100,
        adminUsername:                'azureuser',
        kubernetesVersion:            '1.11.5',
        count:                        3,
        agentVmSize:                  'Standard_D2_v2',
        location:                     'westeurope',
        enableHttpApplicationRouting: false,
        enableMonitoring:             true,
        networkPlugin:                "kubenet",
      });

      set(this, `cluster.${ configField }`, config);
    } else {
      const tags = get(config, 'tags') || []
      const map = {}

      tags.map((t = '') => {
        const split = t.split('=')

        set(map, split[0], split[1])
      })
      set(this, 'tags', map)

      // if (get(config, 'networkPolicy')) {
      //   set(this, 'netMode', 'advanced')
      // }
    }
  },

  config: alias('cluster.%%DRIVERNAME%%EngineConfig'),

  zones:                  aksRegions,
  versions:               null,
  machineSizes:           sizes,
  step:                   1,
  monitoringRegionConent: [],

  editing:       equal('mode', 'edit'),
  isNew:         equal('mode', 'new'),

  actions: {
    // save() {},
    // cancel(){
    //   // probably should not remove this as its what every other driver uses to get back
    //   get(this, 'router').transitionTo('global-admin.clusters.index');
    // },

    authenticate(cb) {
      const store = get(this, 'globalStore')
      const data = {
        clientId:       get(this, 'config.clientId'),
        clientSecret:   get(this, 'config.clientSecret'),
        subscriptionId: get(this, 'config.subscriptionId'),
        tenantId:       get(this, 'config.tenantId'),
        region:         get(this, 'config.location')
      };
      const aksRequest = {
        versions: store.rawRequest({
          url:    '/meta/aksVersions',
          method: 'POST',
          data
        }),
        virtualNetworks: store.rawRequest({
          url:    '/meta/aksVirtualNetworks',
          method: 'POST',
          data
        })
      }

      return hash(aksRequest).then((resp) => {
        const { versions, virtualNetworks } = resp;

        setProperties(this, {
          step:            2,
          versions:        (get(versions, 'body') || []),
          virtualNetworks: (get(virtualNetworks, 'body') || []),
        });

        cb(true);
      }).catch((xhr) => {
        const err = xhr.body.message || xhr.body.code || xhr.body.error;

        setProperties(this, { errors: [err], });

        cb(false, [err]);
      });
    },

    setTags(section) {
      const out = []

      for (let key in section) {
        out.pushObject(`${ key }=${ section[key] }`)
      }
      set(this, 'config.tags', out);
    },
  },

  // resetAdvancedOptions: on('init', observer('netMode', function() {
  //   if (get(this, 'netMode') === 'default') {
  //     const config = get(this, 'config');

  //     setProperties(config, {
  //       subnet:                      null,
  //       virtualNetwork:              null,
  //       virtualNetworkResourceGroup: null,
  //       serviceCidr:                 null,
  //       dnsServiceIp:                null,
  //       dockerBridgeCidr:            null
  //     });
  //   }
  // })),

  networkChoice: computed({
    set( key, value = '' ) {
      const [subnet, virtualNetwork, virtualNetworkResourceGroup] = value.split(':');
      const config = get(this, 'config');

      if (subnet && virtualNetwork && virtualNetworkResourceGroup) {
        setProperties(config, {
          subnet,
          virtualNetwork,
          virtualNetworkResourceGroup
        });
      }

      return value;
    }
  }),

  filteredVirtualNetworks: computed('config.virtualNetwork', 'virtualNetworks', function() {
    const vnets = get(this, 'virtualNetworks');
    const subNets = [];

    vnets.forEach( (vnet) => {
      get(vnet, 'subnets').forEach( (subnet) => {
        subNets.pushObject({
          name:  `${ get(subnet, 'name') } (${ get(subnet, 'addressRange') })`,
          group: get(vnet, 'name'),
          value: `${ get(subnet, 'name') }:${ get(vnet, 'name') }:${ get(vnet, 'resourceGroup') }`
        })
      });
    });

    return subNets;
  }),

  isEditable: computed('mode', function() {
    return ( get(this, 'mode') === 'edit' || get(this, 'mode') === 'new' ) ? true : false;
  }),

  saveDisabled: computed('config.subscriptionId', 'config.tenantId', 'config.clientId', 'config.clientSecret', 'config.location', function() {
    return get(this, 'config.tenantId') && get(this, 'config.clientId') && get(this, 'config.clientSecret') && get(this, 'config.subscriptionId') && get(this, 'config.location') ? false : true;
  }),

  // networkPolicyContent: computed(() => {
  //   return NETWORK_POLICY.map((n) => {
  //     return {
  //       label: n,
  //       value: n,
  //     }
  //   })
  // }),

  validate() {
    const intl = get(this, 'intl');
    let model = get(this, 'cluster');
    let errors = model.validationErrors() || [];

    const vnetSet = !!get(this, 'config.virtualNetwork');

    if (vnetSet) {
      errors = errors.concat(this.validateVnetInputs());
    }

    if ( !get(this, 'config.resourceGroup') ) {
      errors.push(intl.t('validation.required', { key: intl.t('clusterNew.azureaks.resourceGroup.label') }));
    }

    if ( !get(this, 'config.sshPublicKeyContents') ) {
      errors.push(intl.t('validation.required', { key: intl.t('clusterNew.azureaks.ssh.label') }));
    }

    set(this, 'errors', errors);

    return errors.length === 0;
  },

  validateVnetInputs() {
    const intl   = get(this, 'intl');
    const errors = [];
    const config = get(this, 'config');
    const vnet   = get(this, 'virtualNetworks').findBy('name', get(config, 'virtualNetwork'));

    if (vnet) {
      let subnet = get(vnet, `subnets`).findBy('name', get(config, 'subnet'));
      let vnetRange  = ipaddr.parseCIDR(get(subnet, 'addressRange'));

      let {
        podCidr, serviceCidr, dnsServiceIp, dockerBridgeCidr
      } = config;

      let parsedPodCidr          = null;
      let parsedServiceCidr      = null;
      let parsedDnsServiceIp     = null;
      let parsedDockerBridgeCidr = null;

      if (!podCidr && !serviceCidr && !dnsServiceIp && !dockerBridgeCidr) {
        errors.pushObject('You must include all required fields when using a Virtual Network');
      }


      try {
        parsedPodCidr = ipaddr.parseCIDR(podCidr);

        // check if serviceCidr falls within the VNet/Subnet range
        if (parsedPodCidr && vnetRange[0].match(parsedPodCidr)) {
          errors.pushObject('Kubernetes pod address range must fall within the selected Virtual Network range.');
        }
      } catch ( err ) {
        errors.pushObject('Kubernetes pod address range must be valid CIDR format.');
      }

      try {
        parsedServiceCidr = ipaddr.parseCIDR(serviceCidr);

        // check if serviceCidr falls within the VNet/Subnet range
        if (parsedServiceCidr && vnetRange[0].match(parsedServiceCidr)) {
          errors.pushObject(intl.t('clusterNew.azureaks.errors.included.parsedServiceCidr'));
        }
      } catch ( err ) {
        errors.pushObject(intl.t('clusterNew.azureaks.errors.included.serviceCidr'));
      }

      // check if serviceCidr falls within the podCidr range
      if (parsedPodCidr && parsedServiceCidr && parsedServiceCidr[0].match(parsedPodCidr)) {
        errors.pushObject('Kubernetes service address range must fall within the Pod Network range.');
      }

      try {
        parsedDnsServiceIp = ipaddr.parse(dnsServiceIp);

        // check if dnsService exists in range
        if (parsedDnsServiceIp && vnetRange[0].match(parsedDnsServiceIp, vnetRange[1])) {
          errors.pushObject('clusterNew.azureaks.errors.included.parsedDnsServiceIp');
        }
      } catch ( err ) {
        errors.pushObject('clusterNew.azureaks.errors.included.dnsServiceIp');
      }

      try {
        parsedDockerBridgeCidr = ipaddr.parseCIDR(dockerBridgeCidr);

        // check that dockerBridge doesn't overlap
        if (parsedDockerBridgeCidr && ( vnetRange[0].match(parsedDockerBridgeCidr) || parsedServiceCidr[0].match(parsedDockerBridgeCidr) )) {
          errors.pushObject('clusterNew.azureaks.errors.included.parsedDockerBridgeCidr');
        }
      } catch ( err ) {
        errors.pushObject('clusterNew.azureaks.errors.included.dockerBridgeCidr');
      }
    }

    return errors;
  },

  willSave() {
    const enableMonitoring = get(this, 'config.enableMonitoring')
    const config = get(this, 'config')

    if (enableMonitoring) {
      setProperties(config, {
        logAnalyticsWorkspaceResourceGroup: '',
        logAnalyticsWorkspace:              '',
      })
    } else {
      setProperties(config, {
        logAnalyticsWorkspaceResourceGroup: null,
        logAnalyticsWorkspace:              null,
      })
    }

    return this._super(...arguments);
  },
});
