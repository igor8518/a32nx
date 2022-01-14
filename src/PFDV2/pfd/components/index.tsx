import { A320Failure, FailuresConsumer } from '@flybywiresim/failures';
import { ClockEvents, ComponentProps, DisplayComponent, EventBus, FSComponent, Subject, VNode } from 'msfssdk';
import { Arinc429Word } from '../shared/arinc429';
import { Arinc429Values } from '../shared/ArincValueProvider';
import { DisplayUnit } from '../shared/displayUnit';
import '../style.scss';
import { AltitudeIndicator, AltitudeIndicatorOfftape } from './AltitudeIndicator';
import { AttitudeIndicatorFixedCenter, AttitudeIndicatorFixedUpper } from './AttitudeIndicatorFixed';
import { FMA } from './FMA';
import { HeadingOfftape, HeadingTape } from './HeadingIndicator';
import { Horizon } from './horizon';
import { LandingSystem } from './LandingSystemIndicator';
import { AirspeedIndicator, AirspeedIndicatorOfftape, MachNumber } from './SpeedIndicator';
import { VerticalSpeedIndicator } from './VerticalSpeedIndicator';

export const getDisplayIndex = () => {
    const url = document.getElementsByTagName('a32nx-pfd')[0].getAttribute('url');
    return url ? parseInt(url.substring(url.length - 1), 10) : 0;
};

interface PFDProps extends ComponentProps {
    bus: EventBus;
    instrument: BaseInstrument;
}

export class PFDComponent extends DisplayComponent<PFDProps> {
    private headingFailed = Subject.create(true);

    private displayFailed = Subject.create(false);

    private failuresConsumer;

    constructor(props: PFDProps) {
        super(props);
        this.failuresConsumer = new FailuresConsumer('A32NX');
    }

    public onAfterRender(node: VNode): void {
        super.onAfterRender(node);

        this.failuresConsumer.register(getDisplayIndex() === 1 ? A320Failure.LeftPfdDisplay : A320Failure.RightPfdDisplay);

        const sub = this.props.bus.getSubscriber<Arinc429Values & ClockEvents>();

        sub.on('headingAr').handle((h) => {
            if (this.headingFailed.get() !== h.isNormalOperation()) {
                this.headingFailed.set(!h.isNormalOperation());
            }
        });

        sub.on('realTime').atFrequency(1).handle((_t) => {
            this.failuresConsumer.update();
            this.displayFailed.set(this.failuresConsumer.isActive(getDisplayIndex() === 1 ? A320Failure.LeftPfdDisplay : A320Failure.RightPfdDisplay));
        });
    }

    render(): VNode {
        return (
            <DisplayUnit
                failed={this.displayFailed}
                bus={this.props.bus}
            >
                <svg class="pfd-svg" version="1.1" viewBox="0 0 158.75 158.75" xmlns="http://www.w3.org/2000/svg">
                    <Horizon
                        bus={this.props.bus}
                        instrument={this.props.instrument}
                        heading={new Arinc429Word(211)}
                        FDActive
                        selectedHeading={222}
                        isOnGround
                        radioAlt={0}
                        decisionHeight={200}
                        isAttExcessive={false}
                    />
                    <path
                        id="Mask1"
                        class="BackgroundFill"
                        // eslint-disable-next-line max-len
                        d="m32.138 101.25c7.4164 13.363 21.492 21.652 36.768 21.652 15.277 0 29.352-8.2886 36.768-21.652v-40.859c-7.4164-13.363-21.492-21.652-36.768-21.652-15.277 0-29.352 8.2886-36.768 21.652zm-32.046 57.498h158.66v-158.75h-158.66z"
                    />
                    <HeadingTape bus={this.props.bus} failed={this.headingFailed} />
                    <AltitudeIndicator bus={this.props.bus} />
                    <AirspeedIndicator
                        bus={this.props.bus}
                        instrument={this.props.instrument}
                    />
                    <path
                        id="Mask2"
                        class="BackgroundFill"
                        // eslint-disable-next-line max-len
                        d="m32.138 145.34h73.536v10.382h-73.536zm0-44.092c7.4164 13.363 21.492 21.652 36.768 21.652 15.277 0 29.352-8.2886 36.768-21.652v-40.859c-7.4164-13.363-21.492-21.652-36.768-21.652-15.277 0-29.352 8.2886-36.768 21.652zm-32.046 57.498h158.66v-158.75h-158.66zm115.14-35.191v-85.473h20.344v85.473zm-113.33 0v-85.473h27.548v85.473z"
                    />
                    <AirspeedIndicatorOfftape bus={this.props.bus} />

                    <LandingSystem bus={this.props.bus} instrument={this.props.instrument} />
                    <AttitudeIndicatorFixedUpper bus={this.props.bus} />
                    <AttitudeIndicatorFixedCenter bus={this.props.bus} />
                    <VerticalSpeedIndicator bus={this.props.bus} instrument={this.props.instrument} />
                    <HeadingOfftape bus={this.props.bus} failed={this.headingFailed} />
                    <AltitudeIndicatorOfftape bus={this.props.bus} />

                    <MachNumber bus={this.props.bus} />
                    <FMA bus={this.props.bus} />
                </svg>
            </DisplayUnit>
        );
    }
}
