import { DisplayComponent, EventBus, FSComponent, Subject, VNode } from 'msfssdk';

import './common.scss';

import { NXDataStore } from '@shared/persistence';
import { PFDSimvars } from './PFDSimvarPublisher';

type DisplayUnitProps = {
    // electricitySimvar: number
    potentiometerIndex?: number
    failed?: boolean,
    coldDark?: boolean,
    bus: EventBus,
}

enum DisplayUnitState {
    On,
    Off,
    Selftest,
    Standby
}

export class DisplayUnit extends DisplayComponent<DisplayUnitProps> {
    private state: Subject<DisplayUnitState> = Subject.create<DisplayUnitState>(SimVar.GetSimVarValue('L:A32NX_COLD_AND_DARK_SPAWN', 'Bool') ? DisplayUnitState.Off : DisplayUnitState.Standby);

    private readonly simvarPublisher;

    private electricityState: number = 0;

    private potentiometer: number = 0;

    private timeOut: number = 0;

    private selfTestRef = FSComponent.createRef<SVGElement>();

    private pfdRef = FSComponent.createRef<HTMLDivElement>();

    private backLightBleedRef = FSComponent.createRef<HTMLDivElement>();

    constructor(props: DisplayUnitProps) {
        super(props);
        this.simvarPublisher = this.props.bus.getSubscriber<PFDSimvars>();
    }

    public onAfterRender(node: VNode): void {
        super.onAfterRender(node);

        const url = document.getElementsByTagName('a32nx-pfd')[0].getAttribute('url');
        const displayIndex = url ? parseInt(url.substring(url.length - 1), 10) : 0;

        this.simvarPublisher.on('potentiometer_captain').whenChanged().handle((value) => {
            if (displayIndex === 1) {
                this.potentiometer = value;
                this.updateState();
            }
        });

        this.simvarPublisher.on('potentiometer_fo').whenChanged().handle((value) => {
            if (displayIndex === 2) {
                this.potentiometer = value;
                this.updateState();
            }
        });
        this.simvarPublisher.on('elec').whenChanged().handle((value) => {
            if (displayIndex === 1) {
                this.electricityState = value;
                this.updateState();
            }
        });

        this.simvarPublisher.on('elecFo').whenChanged().handle((value) => {
            if (displayIndex === 2) {
                this.electricityState = value;
                this.updateState();
            }
        });

        this.state.sub((v) => {
            if (v === DisplayUnitState.Selftest) {
                this.selfTestRef.instance.style.display = 'block';
                this.pfdRef.instance.style.display = 'none';
                this.backLightBleedRef.instance.style.display = 'block';
            } else if (v === DisplayUnitState.On) {
                this.selfTestRef.instance.style.display = 'none';
                this.pfdRef.instance.style.display = 'block';
                this.backLightBleedRef.instance.style.display = 'block';
            } else {
                this.selfTestRef.instance.style.display = 'none';
                this.pfdRef.instance.style.display = 'none';
                this.backLightBleedRef.instance.style.display = 'none';
            }
        }, true);
    }

    setTimer(time: number) {
        this.timeOut = window.setTimeout(() => {
            if (this.state.get() === DisplayUnitState.Standby) {
                this.state.set(DisplayUnitState.Off);
            } if (this.state.get() === DisplayUnitState.Selftest) {
                this.state.set(DisplayUnitState.On);
            }
        }, time * 1000);
    }

    updateState() {
        if (this.state.get() !== DisplayUnitState.Off && this.props.failed) {
            this.state.set(DisplayUnitState.Off);
        } else if (this.state.get() === DisplayUnitState.On && (this.potentiometer === 0 || this.electricityState === 0)) {
            this.state.set(DisplayUnitState.Standby);
            this.setTimer(10);
        } else if (this.state.get() === DisplayUnitState.Standby && (this.potentiometer !== 0 && this.electricityState !== 0)) {
            this.state.set(DisplayUnitState.On);
            clearTimeout(this.timeOut);
        } else if (this.state.get() === DisplayUnitState.Off && (this.potentiometer !== 0 && this.electricityState !== 0 && !this.props.failed)) {
            this.state.set(DisplayUnitState.Selftest);
            this.setTimer(parseInt(NXDataStore.get('CONFIG_SELF_TEST_TIME', '15')));
        } else if (this.state.get() === DisplayUnitState.Selftest && (this.potentiometer === 0 || this.electricityState === 0)) {
            this.state.set(DisplayUnitState.Off);
            clearTimeout(this.timeOut);
        }
    }

    render(): VNode {
        return (

            <>
                <div ref={this.backLightBleedRef} class="BacklightBleed" />

                <svg ref={this.selfTestRef} class="SelfTest" viewBox="0 0 600 600">
                    <rect class="SelfTestBackground" x="0" y="0" width="100%" height="100%" />

                    <text
                        class="SelfTestText"
                        x="50%"
                        y="50%"
                    >
                        SELF TEST IN PROGRESS
                    </text>
                    <text
                        class="SelfTestText"
                        x="50%"
                        y="56%"
                    >
                        (MAX 40 SECONDS)
                    </text>
                </svg>

                <div style="display:none" ref={this.pfdRef}>{this.props.children}</div>
            </>

        );
    }
}
